# Apps Script Changes for Daily Leaderboard

These changes must be applied manually in the Google Apps Script editor attached
to the "What's That Bug — Feedback" spreadsheet.

## Changes to the `doGet` handler (leaderboard action)

### 1. Add ET date helper at the top of the script

```js
function getTodayET() {
  var now = new Date();
  var etStr = Utilities.formatDate(now, 'America/New_York', 'yyyy-MM-dd');
  return etStr;
}

function getYesterdayET() {
  var now = new Date();
  now.setDate(now.getDate() - 1);
  var etStr = Utilities.formatDate(now, 'America/New_York', 'yyyy-MM-dd');
  return etStr;
}
```

### 2. Modify the leaderboard action

Replace the existing leaderboard data reading logic with:

```js
if (action === 'leaderboard') {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaderboard');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var tsCol = headers.indexOf('timestamp');
  var setCol = headers.indexOf('set_key');
  var scoreCol = headers.indexOf('score');
  var streakCol = headers.indexOf('streak');
  var nameCol = headers.indexOf('name');
  var countryCol = headers.indexOf('country');

  var todayET = getTodayET();
  var yesterdayET = getYesterdayET();

  var boards = {
    bugs_101_time_trial: [],
    bugs_101_streak: [],
    time_trial: [],
    streak: [],
    bugs_101_time_trial_yesterday_champion: null,
    bugs_101_streak_yesterday_champion: null,
    time_trial_yesterday_champion: null,
    streak_yesterday_champion: null,
  };

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts = new Date(row[tsCol]);
    var dateET = Utilities.formatDate(ts, 'America/New_York', 'yyyy-MM-dd');
    var setKey = row[setCol];

    if (!boards.hasOwnProperty(setKey)) continue;

    var entry = {
      name: row[nameCol],
      country: row[countryCol],
      score: row[scoreCol],
      streak: row[streakCol],
      timestamp: row[tsCol],
    };

    // Today's entries
    if (dateET === todayET) {
      boards[setKey].push(entry);
    }

    // Yesterday's champion tracking
    var champKey = setKey + '_yesterday_champion';
    if (dateET === yesterdayET) {
      var isStreak = setKey.includes('streak');
      var currentVal = isStreak ? (entry.streak || 0) : (entry.score || 0);
      var existing = boards[champKey];
      if (!existing) {
        boards[champKey] = entry;
      } else {
        var existingVal = isStreak ? (existing.streak || 0) : (existing.score || 0);
        if (currentVal > existingVal) {
          boards[champKey] = entry;
        }
      }
    }
  }

  // Sort today's entries (descending) and keep top 10
  ['bugs_101_time_trial', 'time_trial'].forEach(function(key) {
    boards[key].sort(function(a, b) { return (b.score || 0) - (a.score || 0); });
    boards[key] = boards[key].slice(0, 10);
  });
  ['bugs_101_streak', 'streak'].forEach(function(key) {
    boards[key].sort(function(a, b) { return (b.streak || 0) - (a.streak || 0); });
    boards[key] = boards[key].slice(0, 10);
  });

  return ContentService.createTextOutput(JSON.stringify(boards))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 3. Deploy

After making changes:
1. Click "Deploy" → "Manage deployments"
2. Edit the existing deployment
3. Set version to "New version"
4. Click "Deploy"
