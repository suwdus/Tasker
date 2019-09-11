/**
 *
 * @author Philip M. Turner
 *
 * Data access layer for Task.
 *
 */

const EMPTY_DATA_SCHEMA =
{
  currentSprintId: null,
  tasks: {},    /* Mutable task store. Archived tasks are flaged but not deleted. */
  projects: [], /* An array of project task ids. */
  sprints: {},  /* Mutable store for sprints. */
}

function Dao() {
}

Dao.prototype.createTask = function(task, doS3Upload) {
  const appData = this.getAppData();

  //TODO: Validate data...

  var id = 0; /* id will be `0` when adding the first task */
  if (Object.keys(appData.tasks).length > 0) { /*Get next id */
    var _ = require('underscore');
    id = _.max(Object.values(appData.tasks),
        (task) => { return task.id; }).id + 1;
  }

  task.id               = id;
  appData.tasks[id]  = task; /* Add task */

  if (task.project)
    appData.projects.push(task.id);

  /* If this task should be a child of an existing task/project, relate them */
  if (task.parentTaskId) {
    var parentTask = appData.tasks[task.parentTaskId];
    if (parentTask)
      parentTask.subtasks.push(task.id);
    else
      throw `Parent project with id ${task.parentProjectId} does not exist`;
  }

  const json = JSON.stringify(appData);

  require('fs').promises.writeFile(config.taskFile, json)
  .then(() => {
    console.log('1 task created');

    if (doS3Upload) {
      var S3Util = require('../utils/s3-util');
      var s3Util = new S3Util();
      s3Util.uploadData();
    }
  }).catch((err) => {
    console.log('Could not create task', err);
  });

}

Dao.prototype.createSprint = function(sprintModel) {
  var appData = this.getAppData();

  var id = 0; /* id will be `0` when adding the first sprint */
  if (Object.keys(appData.sprints).length > 0) { /*Get next id */
    var _ = require('underscore');
    id = _.max(Object.values(appData.sprints),
        (sprint) => { return sprint.id; }).id + 1;
  }

  sprintModel.id = id;
  appData.sprints[id] = sprintModel;

  const json = JSON.stringify(appData);

  require('fs').promises.writeFile(config.taskFile, json)
  .then(() => {
    console.log('1 sprint created');
  }).catch((err) => {
    console.log('Could not create sprint', err);
  });
}

Dao.prototype.selectSprint = function(sprintId) {

  config.tmp.selectedSprintId = sprintId;
  const json = JSON.stringify(config);

  require('fs').promises.writeFile(config.configFile, json)
  .then(() => {
    console.log(`sprint ${sprintId} selected`);
  }).catch((err) => {
    console.log('Could not select sprint', err);
  });

  if (true) { //TODO
    var appData = this.getAppData();
    appData.currentSprintId = sprintId;

    const appJson = JSON.stringify(appData);
    require('fs').promises.writeFile(config.taskFile, appJson)
    .then(() => {
      console.log('updated current sprint id for team');
    }).catch((err) => {
      console.log('Could not update current sprint id for team', err);
    });
  }
}

Dao.prototype.addSprintTask = function(sprintTaskModel) {

  var appData = this.getAppData();
  const sprint = appData.sprints[config.tmp.selectedSprintId];

  sprint.sprintTasks[sprintTaskModel.taskId] = sprintTaskModel;

  const json = JSON.stringify(appData);

  require('fs').promises.writeFile(config.taskFile, json)
  .then(() => {
    console.log('task added to sprint');
  }).catch((err) => {
    console.log('error adding task to sprint', err);
  });
}

/* Delete tasks from ~/.tasks. */
Dao.prototype.clearTasks = function() {
  const schema = JSON.stringify(EMPTY_DATA_SCHEMA);

  require('fs').promises
  .writeFile(config.taskFile, schema)
  .then(() => console.log('Successfully cleared all tasks from ' + config.taskFile))
  .catch((err) => console.log('Error writing data to task file', err));
}

Dao.prototype.getAppData = function(filter) { //TODO
  const AppData = require('../logic-objects/app-data');
  const data = require(config.taskFile);

  return new AppData(data);
}

Dao.prototype.getAllTasks = function() {
  return Object.values(this.getAppData().tasks);
}

Dao.prototype.updateTask = async function(update) {

  const appDataModel = this.getAppData();
  const taskModel    = appDataModel.tasks[update.taskId];
  /* Task ID of the task we're modifying */
  const taskId       = taskModel.id;

  /* Make task model modifications */
  taskModel.points += (!update.pointUpdate) ? 0 : update.pointUpdate;
  taskModel.annotations.push(update.annotation);

  if (update.shouldRelateParent) {
    const parentTaskModel = appDataModel.tasks[update.relatedParentTaskId];
    //Add task as child of parent task model subtasks if not already present...
    if (! parentTaskModel.subtasks.includes(taskModel.id))
      parentTaskModel.subtasks.push(taskModel.id);
    //Set parent id on this task model...
    taskModel.parentTaskId = parentTaskModel.id;
  }

  const modifiedData = JSON.stringify(appDataModel);

  await require('fs').promises
  .writeFile(config.taskFile, modifiedData)
  .then(() => console.log('Task successfully updated.'))
  .catch((err) => console.log('Error updating task', err));

  if (taskModel.points === 0)
    this.completeTask(taskId);
}

Dao.prototype.deleteTasks = function(taskIds) {
  taskIds.forEach( async (taskId) => {
    await this.deleteTask(taskId);
  });
}

Dao.prototype.deleteTask = function(taskId) {

  return new Promise( (resolve, reject) => {
    var appDataModel              = this.getAppData();
    var shouldDeleteSubtasks = true; //TODO: Make configurable.
    const task = appDataModel.tasks[taskId];
    if (! task)
      throw `task with id ${taskId} does not exist!!`;

    const deleteRecursive = (task) => {
      if (! task || !appDataModel.tasks[task.id]) {
        console.log(`Task undefined or unpresent in appDataModel, returning`); return;
      }
      if (shouldDeleteSubtasks && task.subtasks.length > 0) {
        console.log(`shouldDeleteSubtasks flag is true, deleteing subtasks...`);
        task.subtasks.forEach((subtaskId) => {
          deleteRecursive(appDataModel.tasks[subtaskId]);
        });
      }
      /* If task is a project , remove it from the project list */
      if (task.project && appDataModel.projects.includes(task.id)) {
        const idx           = appDataModel.projects.indexOf(task.Id);
        const removedTaskId = appDataModel.projects.pop(idx);
        console.log(`Removing task with id ${removedTaskId} from project list`);
      }

      console.log(`Removing task with id ${task.id}`);

      delete appDataModel.tasks[task.id];
    }

    deleteRecursive(task);

    require('fs').promises
    .writeFile(config.taskFile, JSON.stringify(appDataModel))
    .then(() => {
      console.log('Task successfully deleted.')
      resolve();
    })
    .catch((err) => {
      console.log('Error deleting task', err)
      reject();
    });
  });
}

Dao.prototype.getProjects = function() {
  return this.getAppData().projects;
}

Dao.prototype.completeTask = function(id) {
  var appData  = this.getAppData();
  var tasks = appData.tasks;

  if (!tasks[id])
    throw `Task ${id} does not exist!!!`;

  const task = tasks[id];

  if (task.points === 0) { /* Set completion fields on the task. */
    task.complete = true;

    task.annotations.push({
      comment: '{bot}> task complete. mission complete. on to other work.',
      date: require('moment')(),
      pointUpdate: '0 points left, task complete',
      updatedBy: 'bot'
    });

    task.completionDate = require('moment')();
  }

  const modData   = JSON.stringify(appData);

  /* Write modified data to disk */
  require('fs').promises
  .writeFile(config.taskFile, modData)
  .then(() => console.log('task successfully completed.'))
  .catch((err) => console.log('error completing task', err));

}

module.exports = new Dao();
