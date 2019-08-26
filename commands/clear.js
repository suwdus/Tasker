/**
 *
 * @author Philip M. Turner
 *
 */


/* task clear */


const Dao = require('../dao');

function ClearCommand(tasks) {
  this.dao = new Dao();
}

ClearCommand.prototype.run = function(args) {

  this.dao.clearTasks();

}

module.exports = ClearCommand;

