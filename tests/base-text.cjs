// Read the base Japanese text without ruby annotations when asserting content.
module.exports = locator => locator.evaluate(element => {
  const clone = element.cloneNode(true);
  clone.querySelectorAll('rt,rp').forEach(node => node.remove());
  return clone.textContent;
});
