const { Client, Intents } = require('discord.js');
const { token } = require('./config.json');
const { createReadStream } = require('node:fs');
const fs = require('fs');
const urlLib = require("url");
const { join } = require('node:path');
const { spawn } = require("child_process");
const { generateDependencyReport, VoiceConnectionStatus, AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, entersState, StreamType, getVoiceConnection } = require('@discordjs/voice');
const yt = require("./youtube");
const { url } = require('node:inspector');
const https = require('https');

console.log(generateDependencyReport());

const client = new Client({ intents: 641 });
const player = createAudioPlayer();
const selecting = [];

var queue = [];

function isInt(value) {
    return !isNaN(value) && (function(x) { return (x | 0) === x; })(parseFloat(value))
}

const isUrl = (s) => {
    try {
      new urlLib.URL(s);
      return true;
    } catch (err) {
        console.log("Error with URL: " + err);
      return false;
    }
};

function YTDurationToSeconds(duration) {
    var match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  
    match = match.slice(1).map(function(x) {
      if (x != null) {
          return x.replace(/\D/, '');
      }
    });
  
    var hours = (parseInt(match[0]) || 0);
    var minutes = (parseInt(match[1]) || 0);
    var seconds = (parseInt(match[2]) || 0);
  
    return hours * 3600 + minutes * 60 + seconds;
  }

client.once('ready', () => {
	console.log('Ready!');
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;

	const { commandName } = interaction;

	if (commandName === 'play') {
        if(interaction.member.voice.channelId != null){
            const link = await interaction.options.getString('song');
            await interaction.deferReply();

            if(isUrl(link)){
                console.log("User has entered a URL");
                const tempUrl = new urlLib.URL(link);
                const params = tempUrl.searchParams;
                const list = params.get('list');
                const v = params.get('v');
                if(list){
                    // this is a playlist probably
                    await interaction.editReply("Searching playlist " + link + " for videos...");
                    yt.playlist(list, function(results){
                        console.log("Adding videos...");
                        let followUpMsg = "Found " + results.length + " videos :flag_nl: :wales: :people_hugging:";
                        for(let i = 0; i < results.length; i++){
                            if(results[i]["unavailable"] === true){
                                followUpMsg += "\nVideo \"" + results[i]["snippet"]["title"] + "\" was unavailable! Skipped.";
                            } else {
                                addToQueue(results[i]["snippet"]["resourceId"]["videoId"], interaction, results[i]["snippet"]["title"], results[i]["duration"], false);
                            }
                        }
                        interaction.followUp(followUpMsg);
                        return;
                    });
                } else if (v) {
                    // this is a video probably
                    console.log("User probably entered a direct video link");
                    yt.video(v, function(data){
                        addToQueue(v, interaction, data["snippet"]["title"], data["contentDetails"]["duration"], false);
                        interaction.editReply("Added song \"" + data["snippet"]["title"] + "\" to queue!");
                    });
                } else if (tempUrl.hostname === "wastebin.party") {
                    console.log("Fred link");
                    const options = {
                        hostname: 'wastebin.party',
                        port: 443,
                        path: '/raw' + tempUrl.pathname,
                        method: 'GET'
                    }

                    let ytUrlData = "";
                    const req = https.request(options, res => {
                        res.on('data', d => {
                            ytUrlData += d;
                        });
                        res.on('end', function() {
                            const splitUrls = ytUrlData.split(/\r?\n/);
                            interaction.editReply("Found " + splitUrls.length + " videos... adding...");
                            for(let i = 0; i < splitUrls.length; i++){
                                console.log("URL " + i + ": " + splitUrls[i]);
                                const tempSingleYtURL = new urlLib.URL(splitUrls[i]);
                                const params2 = tempSingleYtURL.searchParams;
                                const tempVideoId = params2.get('v');
                                yt.video(tempVideoId, function(data){
                                    addToQueue(tempVideoId, interaction, data["snippet"]["title"], data["contentDetails"]["duration"], false);
                                });
                            }
                        });
                    });
                    req.on('error', error => {
                    console.error("Error requesting fred playlist" + error);
                    });
                    req.end();
                }
                else {
                    // this link has nothing we can use ;-;
                    await interaction.editReply("Link not recognised. Sorry :(");
                    console.log("User entered unknown link? MEGA PANIC");
                }
            } else if(isInt(link)){
                console.log("This user has entered a numeric song selection");
                for(let i = 0; i < selecting.length; i++){
                    if(selecting[i]["user"] === interaction.member.id){
                        const immediate = await interaction.options.getBoolean('immediate');

                        if(immediate){
                            await interaction.editReply("Playing song `" + link + "`: " + selecting[i]["options"][link-1]["snippet"]["title"] + " immediately!");
                        } else {
                            await interaction.editReply("Adding song `" + link + "`: " + selecting[i]["options"][link-1]["snippet"]["title"] + " to queue!");
                        }

                        addToQueue(selecting[i]["options"][link-1]["id"]["videoId"], interaction, selecting[i]["options"][link-1]["snippet"]["title"], selecting[i]["options"][link-1]["duration"], immediate);
                        selecting.splice(i, 1);
                        return;
                    }
                }
            } else {
                await interaction.editReply('Searching for song...');
                
                let searchResString = "Searching for `" + link + "`...\n";
                yt.search(link, function(results){
                    for(let i = 0; i < results.length; i++){
                        let duration = "";
                        let durationSec = YTDurationToSeconds(results[i]["duration"]);
                        let t = new Date(1970, 0, 1);
                        t.setSeconds(durationSec);
                    
                        if(durationSec >= 3600){
                            duration = t.toTimeString().split(' ')[0];
                        } else {
                            let minutes = Math.floor(durationSec / 60);
                            let seconds = durationSec % 60;
                            if(seconds < 10){
                                seconds = "0" + seconds;
                            }
                            duration = minutes + ":" + seconds;
                        }

                        searchResString += "Found song `" + (i+1) + "`: " + results[i]["snippet"]["title"] + " **「" + duration + "」** - <https://youtu.be/" + results[i]["id"]["videoId"] + ">\n";
                    }
                    searchResString += "**Please select a song with /play `1-5`!**";
                    selecting.push({user: interaction.member.id, options: results});
                    interaction.followUp(searchResString);
                });
            }
        } else {
            await interaction.reply('Please join a voice channel!');
        }
	} else if (commandName == 'stop') {
        await interaction.reply('Shutting down...');
        const guild = interaction.member.guild.id;
        const connection = getVoiceConnection(guild);
        connection.destroy();
    } else if (commandName == 'queue') {
        await interaction.deferReply();

        let totalQueueLength = 0;
        let queueMsg = "Current queue:\n";
        for(let i = 0; i < queue.length; i++){
            totalQueueLength += queue[i].durationSec;
            if(i == 0){
                queueMsg += ("`" + (i+1) + ">`: " + queue[i].title + " **「" + queue[i].duration + "」**\n");
            } else if(i > 0 && i < 20){
                queueMsg += ("`" + (i+1) + "`: " + queue[i].title + " **「" + queue[i].duration + "」**\n");
            } else if (i == 20) {
                queueMsg += "... and " + (queue.length-i) + " more."
            }
        }
        if(queue.length == 0){
            queueMsg = "The queue is empty!";
        }

        let hours = Math.floor(totalQueueLength / 60 / 60);
        if(hours < 10){
            hours = "0" + hours;
        }
        let minutes = Math.floor((totalQueueLength-(hours*60*60)) / 60);
        if(minutes < 10){
            minutes = "0" + minutes;
        }
        let seconds = totalQueueLength % 60;
        if(seconds < 10){
            seconds = "0" + seconds;
        }
        let queueLenStr = hours + ":" + minutes + ":" + seconds;
        queueMsg += " Total Length: **「" + queueLenStr + "」**";

        await interaction.editReply(queueMsg);
    } else if (commandName == "skip") {
        if(interaction.member.voice.channelId != null){
            if(queue.length > 0){
                const num1 = await interaction.options.getNumber('number');
                const num2 = await interaction.options.getNumber('number2');
                console.log("Skipping song num1: " + num1 + " num2: " + num2);
                if(num1 === null && num2 === null){
                    // no numbers provided, just skip the current song
                    await interaction.reply('Skipping current song...');
                    console.log("no numbers provided, just skip the current song");
                    moveToNextSong();
                } else if (num1 !== null && num2 === null){
                    await interaction.reply('Skipping ' + num1 + ' songs...');
                    console.log("only num 1 is present, skip x number of songs");
                    moveToNextSong(num1);
                    // only num 1 is present, skip x number of songs
                } else if (num1 !== null && num2 !== null){
                    await interaction.reply('Skipping songs ' + num1 + ' to ' + num2);
                    console.log("boths nums provided, skip songs x to y");
                    // boths nums provided, skip songs x to y
                }
            } else {
                await interaction.reply('Nothing to skip!');
            }
        } else {
            await interaction.reply('Please join a voice channel!');
        }
    }
});

function addToQueue (link, interaction, title, duration, immediate) {
    let durationSec = YTDurationToSeconds(duration);
    let t = new Date(1970, 0, 1);
    t.setSeconds(durationSec);

    if(durationSec >= 3600){
        duration = t.toTimeString().split(' ')[0];
    } else {
        let minutes = Math.floor(durationSec / 60);
        let seconds = durationSec % 60;
        if(seconds < 10){
            seconds = "0" + seconds;
        }
        duration = minutes + ":" + seconds;
    }

    var newSongIndex = 0;
    if(!immediate){
        newSongIndex = (queue.push({id: link, state: "pending", title: title, duration: duration, durationSec: durationSec, requestedIn: interaction.channelId}))-1;
    } else {
        queue.unshift({id: link, state: "pending", title: title, duration: duration, durationSec: durationSec, requestedIn: interaction.channelId});
    }

    if(!immediate){
        if(queue.length == 1){
            // the queue is empty, download and play immediately
            queue[newSongIndex].state = "downloading";
            downloadSong(link, function(err){
                songIndex = queue.findIndex((obj => obj.id == link));
                if(err === "unavailable"){
                    const channel = client.channels.fetch(queue[songIndex]["requestedIn"]);
                    channel.send(queue[songIndex][title] + ' was unavailable to download!');
                    queue.splice(songIndex, 1);
                    return;
                }
                console.log("Song queued and ready to play.");
                queue[songIndex].state = "ready";
                connectAndPlay(link, interaction);
            });
        }
        if(queue.length == 2){
            // the queue already has a song in, just download
            queue[newSongIndex].state = "downloading";
            downloadSong(link, function(err){
                songIndex = queue.findIndex((obj => obj.id == link));
                if(err === "unavailable"){
                    const channel = client.channels.fetch(queue[songIndex]["requestedIn"]);
                    channel.send(queue[songIndex][title] + ' was unavailable to download!');
                    queue.splice(songIndex, 1);
                    return;
                }
                console.log("Song queued and cached.");
                queue[songIndex].state = "ready";
            });
        }
    } else {
        queue[0].state = "downloading";
        downloadSong(link, function(err){
            songIndex = queue.findIndex((obj => obj.id == link));
            if(err === "unavailable"){
                const channel = client.channels.fetch(queue[songIndex]["requestedIn"]);
                channel.send(queue[songIndex][title] + ' was unavailable to download!');
                queue.splice(songIndex, 1);
                return;
            }
            console.log("Song queued and playing immediately.");
            queue[songIndex].state = "ready";
            connectAndPlay(link, interaction);
        });
    }
}

function downloadSong (videoId, cb) {
    fs.stat('./cache/' + videoId + '.ogg', function(err, stat) {
        if(err == null) {
            console.log("Song is already cached");
            cb();
        } else if(err.code === 'ENOENT') {
            args = ['-f best*[vcodec=none]', '-o \\..\\cache\\%(id)s.%(ext)s', '-x --audio-format vorbis', 'https://www.youtube.com/watch?v=' + videoId]
            const ls = spawn("./exes/yt-dlp.exe", args, {windowsVerbatimArguments: true});

            ls.stdout.on("data", data => {
                console.log(`stdout: ${data}`);
                // if(data.includes("[download] 100%") && data.includes("in") || data.includes("has already been downloaded")) {
                if(data.includes("Deleting original file")){
                    console.log("Download complete.")
                    cb();
                }
                if(data.includes("Video unavailable")){
                    console.log("The video was unavailable.");
                    cb("unavailable");
                }
            });
            ls.stderr.on("data", data => {
                console.log(`stderr: ${data}`);
            });
            ls.on('error', (error) => {
                console.log(`error: ${error.message}`);
            });
        } else {
            console.log('Error checking existing file: ', err.code);
        }
    });
}

player.on(AudioPlayerStatus.Idle, () => {
	console.log('The audio player is idle! Playing next song...');
    moveToNextSong();
});

player.on('stateChange', (oldState, newState) => {
	console.log(new Date().toLocaleString() + ` - Audio player transitioned from ${oldState.status} to ${newState.status}`);
});

function moveToNextSong (skipNum1 = null) {
    if(skipNum1 === null){
        // remove the song just finished
        queue.shift();
    } else {
        queue.splice(0, skipNum1);
    }
    // play the next song
    let nextSong = queue[0];
    if(nextSong != undefined){
        // if the song state isn't ready, it means the next song isn't ready to be played
        if(nextSong.state == "ready"){
            play(nextSong.id);
        } else if (nextSong.state == "downloading") {
            // need to wait for the song to be ready here?
            console.log("Next song is not ready.");
        } else if (nextSong.state == "pending"){
            // if the state is pending the download hasn't been started yet, we can launch it here
            console.log("Next song was not ready, but beginning download of " + nextSong.id);
            nextSong.state = "downloading";
            downloadSong(nextSong.id, function(err){
                songIndex = queue.findIndex((obj => obj.id == nextSong.id));
                if(err === "unavailable"){
                    const channel = client.channels.fetch(queue[songIndex]["requestedIn"]);
                    channel.send(queue[songIndex][title] + ' was unavailable to download!');
                    queue.splice(songIndex, 1);
                    return;
                }
                console.log("Song queued and ready to play.");
                queue[songIndex].state = "ready";
                play(queue[songIndex].id);
            });
        }
    }
    // if there's a next song in the queue (after the one that's about to start)
    if(queue[1] != undefined){
        // cache it
        downloadSong(queue[1].id, function(err){
            songIndex = queue.findIndex((obj => obj.id == queue[1].id));
            queue[songIndex].state = "ready";
            if(err === "unavailable"){
                const channel = client.channels.fetch(queue[songIndex]["requestedIn"]);
                channel.send(queue[songIndex][title] + ' was unavailable to download!');
                queue.splice(songIndex, 1);
                return;
            }
            console.log("Pre-cached next song!");
        });
    }
}

function connectAndPlay(fileName, interaction) {
    let connection = getVoiceConnection(interaction.member.guild.id);
    if(!connection){
        connection = joinVoiceChannel({
            channelId: interaction.member.voice.channelId,
            guildId: interaction.member.guild.id,
            adapterCreator: interaction.member.guild.voiceAdapterCreator,
        });  
    }

    if(connection.state["status"] == "ready"){
        play(fileName);
    } else {
        connection.on(VoiceConnectionStatus.Ready, () => {
            connection.subscribe(player);
            play(fileName);
        });
        connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                connection.destroy();
            }
        });
        connection.on('stateChange', (oldState, newState) => {
            console.log(new Date().toLocaleString() + ` - Connection transitioned from ${oldState.status} to ${newState.status}`);
        });
    }

}

function play(fileName){
    let resource;

    resource = createAudioResource(createReadStream(join(__dirname, '/cache/' + fileName + '.ogg'), {
        inputType: StreamType.OggOpus,
    }));

    player.play(resource);
}

client.login(token);