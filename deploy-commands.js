const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { clientId, guildId, token } = require('./config.json');

const playCmd = new SlashCommandBuilder()
	.setName('play')
	.setDescription('Play a song!')
	.addStringOption(option =>
		option.setName('song')
			.setDescription('The link of the song or search youtube')
			.setRequired(true))
	.addBooleanOption(option => 
		option.setName('immediate')
			.setDescription('Play this song immediately')
			.setRequired(false));

const stopCmd = new SlashCommandBuilder()
	.setName('stop')
	.setDescription('Stop playing.');

const queueCmd = new SlashCommandBuilder()
	.setName('queue')
	.setDescription('View the current queue.');

const skipCmd = new SlashCommandBuilder()
	.setName('skip')
	.setDescription('Skip songs.')
	.addNumberOption(option =>
		option.setName("number")
			.setMinValue(1)
			.setDescription("Number of songs to skip")
			.setRequired(false))
	.addNumberOption(option => 
		option.setName("number2")
			.setMinValue(1)
			.setDescription("Skip from queue number 1 to number 2")
			.setRequired(false));

const commands = [
	playCmd,
    stopCmd,
	queueCmd,
	skipCmd
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);
