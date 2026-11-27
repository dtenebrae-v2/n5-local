const assert=require('node:assert/strict');
module.exports=async function openWordAction(target) {
 await target.waitFor({state:'visible'});
 assert.equal(await target.isVisible(),true,'Dictionary commands must be directly visible');
 await target.click();
};
