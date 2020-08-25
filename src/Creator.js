const mongoose = require('mongoose');
const Discord = require('discord.js');
const Giveaway = require('./Giveaway');
const moment = require('moment');
const { schedule, getWinner, endGiveaway } = require('./functions');
const GiveawayModel = require('../models/GiveawayModel');
const scheduler = require('node-schedule');

class Creator {
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
        .setColor(guild.me.roles.highest.hexColor)
        .setDescription(`🎖️ Winners: ${options.winners}
        🥳 Hosted By: ${this.client.users.cache.get(options.hostedBy).toString()}`)
        .setFooter(`Ends ${moment.utc(new Date(Date.now() + options.duration)).format('lll')}`);

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

        msg.channel.send('Created the giveaway. 🎉');
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
                    message.channel.send(`Congratulations ${winner}, you won the **${data.prize}**!\n**ID**: \`${messageId}\`\n${message.url}`);
                    endGiveaway(messageId);
                }
            }
        }
        return data;
    }

    async fetchGiveaway(messageId) {
        const giveaway = await GiveawayModel.findOne({ messageId: messageId });

        if (!giveaway) return false;

        return giveaway;
    }

    async rerollGiveaway(messageId) {
        const giveaway = await GiveawayModel.findOne({ messageId: messageId });

        if (!giveaway) return false;
        if (data.hasEnded === 'False') return false;

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

                message.channel.send(`Congratulations ${winner}, you won the **${giveaway.prize}**!\n**ID**: \`${messageId}\`\n${message.url}`);

                if (embeds.length === 1) {
                    const embed = embeds[0];

                    embed.setDescription(`🎖️ Winner(s): ${finalWinners}`);

                    await message.edit(embed);
                }
            }
        }
        return giveaway;
    }
}

module.exports = Creator;