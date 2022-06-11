var fs = require('fs');
var readline = require('readline');
var {google} = require('googleapis');
const auth = require('sodium/lib/auth');
var OAuth2 = google.auth.OAuth2;

var SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
var TOKEN_DIR = (__dirname);
var TOKEN_PATH = TOKEN_DIR + '\\yt-token.json';

var authed = {};

fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  authorize(JSON.parse(content), setAuthed);
});

function setAuthed(auth){
  console.log("Yt authed.");
  authed = auth;
}

function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  fs.readFile(TOKEN_PATH, function(err, token) {
    console.log("Reading existing token... " + TOKEN_PATH);
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
    if (err) throw err;
    console.log('Token stored to ' + TOKEN_PATH);
  });
}

function searchVideos(query, callback) {
  var service = google.youtube('v3');
  service.search.list({
    auth: authed,
    part: 'snippet',
    q: query,
    type: 'video'
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var results = response.data.items;
    if (results.length == 0) {
      console.log('No search results found.');
    } else {
      let durationsFetched = 0;
      for(let i = 0; i < results.length; i ++){
        service.videos.list({
          auth: authed,
          id: results[i]["id"]["videoId"],
          part: 'contentDetails'
        }, function(err, response2) {
          if (err) {
            console.log('Failed fetching duration: ' + err);
            return;
          }
          var durationResult = response2.data.items;
          if (durationResult.length == 0) {
            durationResult.log('Duration details not found.');
          } else {
            results[i].duration = durationResult[0]["contentDetails"]["duration"];
            durationsFetched += 1;
            if(durationsFetched == results.length){
              callback(results);
            }
          }
        });
      }
    }
  });
}

function fetchPlaylist(playlistID, callback){
  var service = google.youtube('v3');
  let completeList = [];

  fetchFullPlaylist(authed, playlistID, "", completeList, function(items){
    console.log("Finished gathering videos.. " + items.length + " videos found. Fetching durations...");
  
    let durationsFetched = 0;
    for(let i = 0; i < items.length; i++){
      service.videos.list({
        auth: authed,
        id: items[i]["snippet"]["resourceId"]["videoId"],
        part: 'contentDetails'
      }, function(err, response2) {
        if (err) {
          console.log('Failed fetching duration: ' + err);
          return;
        }
        console.log("Fetched details for " + items[i]["snippet"]["resourceId"]["videoId"]);
        
        if(response2.data.items[0]["contentDetails"]["regionRestriction"] !== undefined){
          if(response2.data.items[0]["contentDetails"]["regionRestriction"]["blocked"] !== undefined){
            console.log("Video is blocked in some countries!");
            console.log(response2.data.items[0]["contentDetails"]["regionRestriction"]["blocked"]);
            for(let r = 0; r < response2.data.items[0]["contentDetails"]["regionRestriction"]["blocked"].length; r++){
              if(response2.data.items[0]["contentDetails"]["regionRestriction"]["blocked"][r] == 'GB'){
                console.log("Video is blocked in the UK! Removing from playlist items...");
                items[i].unavailable = true;
                durationsFetched += 1;
                if(durationsFetched == items.length){
                  console.log("Durations fetched.");
                  callback(items);
                }
                return;
              }
            }
          }
        }

        var durationResult = response2.data.items;
        if (durationResult.length == 0) {
          console.log('Duration details not found.');
        } else {
          items[i].duration = durationResult[0]["contentDetails"]["duration"];
          durationsFetched += 1;
          if(durationsFetched == items.length){
            console.log("Durations fetched.");
            callback(items);
          }
        }
      });
    }
  });
}

function fetchFullPlaylist(authed, playlistID, nextPageToken, completedList, cb){
  var service = google.youtube('v3');
  service.playlistItems.list({
    auth: authed,
    part: 'snippet',
    playlistId: playlistID,
    pageToken: nextPageToken,
    maxResults: 50
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    console.log("Next page: " + response.data["nextPageToken"]);
    console.log("Adding " + response.data.items.length + " videos to completed list.");

    completedList = completedList.concat(response.data.items);
    
    if(response.data["nextPageToken"] == undefined){
      console.log("Reached final playlist page.");
      cb(completedList);
    } else if (response.data.items.length == 50) {
      fetchFullPlaylist(authed, playlistID, response.data["nextPageToken"], completedList, cb);
    }
  });
}

function fetchVideo(videoID, callback) {
  var service = google.youtube('v3');
  service.videos.list({
    auth: authed,
    id: videoID,
    part: 'contentDetails,snippet'
  }, function(err, response) {
    if (err) {
      console.log('Failed fetching single video details: ' + err);
      return;
    }
    callback(response.data.items[0]);
  });
}

module.exports = {
  search: function(query, cb) { searchVideos(query, cb); },
  playlist: function(playlistID, cb) { fetchPlaylist(playlistID, cb); },
  video: function(id, cb) { fetchVideo(id, cb); }
};