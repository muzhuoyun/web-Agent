chrome.storage.local.get('sidepanel_data', function(r) {
  var d = r.sidepanel_data
  if (d && d.html) {
    document.getElementById('content').innerHTML = '<h2>' + (d.title || '') + '</h2><div class="content">' + d.html + '</div><div class="time">' + new Date(d.time).toLocaleString() + '</div>'
  }
})
