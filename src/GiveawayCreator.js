const mongoose = require('mongoose');
const Discord = require('discord.js');
const Giveaway = require('./Giveaway');
const moment = require('moment');
const { schedule, getWinner, endGiveaway } = require('./functions');
const GiveawayModel = require('../models/GiveawayModel');
const scheduler = require('node-schedule');

class GiveawayCreator {
    /**
     * 
     * @param {Discord.Client} client - A discord.js client.
     * @param {string} url - A MongoDB connection string.
     */

    constructor(client, url = '') {
        if (!client) throw new Error("A client wasn't provided.");
        if (!url) throw new Error("A connection string wasn't provided.");

        this.client = client;

        this.mongoUrl = url;

        mongoose.connect(this.mongoUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        this.client.on('ready', async () => {
            const now = new Date();

            const giveaways = await GiveawayModel.find({ endsOn: { $gt: now }, hasEnded: 'False' });

            await schedule(this.client, giveaways);
        });
    }
    
    let remainingTime = this.endAt - Date.now()
    
    async function content() {
 let roundTowardsZero = this.remainingTime > 0 ? Math.floor : Math.ceil;
        // Gets days, hours, minutes and seconds
        let days = roundTowardsZero(remainingTime / 86400000),
            hours = roundTowardsZero(remainingTime / 3600000) % 24,
            minutes = roundTowardsZero(remainingTime / 60000) % 60,
            seconds = roundTowardsZero(remainingTime / 1000) % 60;
        // Increment seconds if equal to zero
        if (seconds === 0) seconds++;
        // Whether values are inferior to zero
        let isDay = days > 0,
            isHour = hours > 0,
            isMinute = minutes > 0;
         let content = this.timeRemaining
            .replace('{duration}', pattern)
            .replace('{days}', days.toString())
            .replace('{hours}', hours.toString())
            .replace('{minutes}', minutes.toString())
            .replace('{seconds}', seconds.toString());
        return content;
}

    /**
     * 
     * @param {GiveawayOptions} options - Options for the giveaway.
     */

    async startGiveaway(options) {
        if (!options.duration) throw new Error("You didn't provide a duration.");
        if (!options.channelId) throw new Error("You didn't provide a channel ID.");
        if (!options.guildId) throw new Error("You didn't provide a guild ID.");
        if (!options.prize) throw new Error("You didn't provide a prize.");
        if (!options.winners || isNaN(options.winners)) throw new Error("You didn't provide an amount of winners OR winners is not a number.");
        if (!options.hostedBy) throw new Error("Please provide a user ID for the person who hosted the giveaway.");

        const guild = this.client.guilds.cache.get(options.guildId);
        const channel = guild.channels.cache.get(options.channelId);
        
        const giveawayEmbed = new Discord.MessageEmbed()
        .setAuthor(options.prize)
        .setColor("#FF0000")
        .setDescription(`React with 🎉 to participate!
Time Left: ${content()}
        Hosted By: ${this.client.users.cache.get(options.hostedBy).toString()}`)
        .setFooter(`${options.winners} winner(s)`);
        .setTimestamp(new Date(Date.now() + options.duration).toISOString());

        const msg = await channel.send(giveawayEmbed);

        await msg.react('🎉');
        
        const newGiveaway = new Giveaway({
            prize: options.prize,
            duration: options.duration,
            channelId: options.channelId,
            guildId: options.guildId,
            endsOn: new Date(Date.now() + options.duration),
            startsOn: new Date(),
            messageId: msg.id,
            winners: options.winners,
            hostedBy: options.hostedBy
        });

       
        await schedule(this.client, [newGiveaway]);

        return newGiveaway;
    }

    /**
     * 
     * @param {string} messageId - A discord message ID.
     */

    async endGiveaway(messageId) {
        let data = await GiveawayModel.findOne({ messageId: messageId });

        if (!data) return false;

        if (data.hasEnded === 'True') return false;

        const job = scheduler.scheduledJobs[`${messageId}`];

        if (!job) return false;

        job.cancel();

        const channel = this.client.channels.cache.get(data.channelId);
        if (channel) {
            const message = await channel.messages.fetch(messageId);

            if (message) {
                const { embeds, reactions } = message;
                const reaction = reactions.cache.get('🎉');
                const users = await reaction.users.fetch();
                const entries = users.filter(user => !user.bot).array();

                if (embeds.length === 1) {
                    const embed = embeds[0];
                    const winner = getWinner(entries, data.winners);
                    const finalWinners = winner.map(user => user.toString()).join(', ');
                    embed.setDescription(`🎖️ Winner(s): ${finalWinners}`);
                    embed.setFooter(this.client.user.username, this.client.user.displayAvatarURL({ format: 'png', size: 512 }));
                    await message.edit(embed);
                    message.channel.send(`Congratulations ${finalWinners}, you won the **${data.prize}**!\n**ID**: \`${messageId}\`\n${message.url}`);
                    endGiveaway(messageId);
                }
            }
        }
        return data;
    }

    /**
     * 
     * @param {string} messageId - A discord message ID.
     */

    async fetchGiveaway(messageId) {
        const giveaway = await GiveawayModel.findOne({ messageId: messageId });

        if (!giveaway) return false;

        return giveaway;
    }

    /**
     * 
     * @param {string} messageId - A discord message ID.
     */

    async rerollGiveaway(messageId) {
        const giveaway = await GiveawayModel.findOne({ messageId: messageId });

        if (!giveaway) return false;
        if (giveaway.hasEnded === 'False') return false;

        const channel = this.client.channels.cache.get(giveaway.channelId);

        if (channel) {
            const message = await channel.messages.fetch(messageId);

            if (message) {
                const { embeds, reactions } = message;

                const reaction = reactions.cache.get('🎉');
                const users = await reaction.users.fetch();
                const entries = users.filter(user => !user.bot).array();

                const winner = getWinner(entries, giveaway.winners);
                const finalWinners = winner.map(user => user.toString()).join(', ');

                message.channel.send(`Congratulations ${finalWinners}, you won the **${giveaway.prize}**!\n**ID**: \`${messageId}\`\n${message.url}`);

                if (embeds.length === 1) {
                    const embed = embeds[0];

                    embed.setDescription(`🎖️ Winner(s): ${finalWinners}`);

                    await message.edit(embed);
                }
            }
        }
        return giveaway;
    }

    /**
     * 
     * @param {string} guildId - A discord guild ID.
     */

    async listGiveaways(guildId) {
        if (!guildId) throw new Error("Please provide a guild ID.");

        const Giveaways = await GiveawayModel.find({ guildId: guildId, hasEnded: 'False' });

        if (Giveaways.length < 1) return false;

        const array = [];

        Giveaways.map(i => array.push({
            hostedBy: this.client.users.cache.get(i.hostedBy).tag ? this.client.users.cache.get(i.hostedBy).tag : "Nobody#0000",
            timeRemaining: i.endsOn - Date.now(),
            messageId: i.messageId,
            prize: i.prize
        }));

        return array;
    }
}

module.exports = GiveawayCreator;
