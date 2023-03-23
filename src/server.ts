import http from 'http';
import path from 'path';

import express from 'express';
import { Server } from 'socket.io';
import tmi from 'tmi.js';

import { youTubeRouter } from './routes';
import type { Message } from './utils/types';

const username = process.env.TWITCH_USERNAME;
if (!username) throw new Error('You should provide twitch username in .env');

const port = process.env.PORT ?? 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const client = new tmi.Client({
  options: { debug: true },
  channels: [username]
});

const message: { youtube: Message[]; twitch: Message[] } = {
  youtube: [],
  twitch: []
};
app.set('socketio', io);
app.set('messages', message);
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '/views/index.html'));
});

app.get('/init', (req, res) => {
  const messages = req.app.get('messages');
  const sortedMessages = [...messages.twitch, ...messages.youtube].sort(
    (a, b) => a.publishedTime - b.publishedTime
  );
  res.send(sortedMessages);
});
app.use('/youtube', youTubeRouter);

client.connect().catch(console.error);
io.on('connection', () => {
  console.log('@connected');
});

client.on('message', (_channel, tags, message) => {
  const messages = app.get('messages');
  const twitchMessage = {
    text: message,
    username: tags.username ?? 'undefined',
    platform: 'twitch',
    publishedTime: tags['tmi-sent-ts'] ? +tags['tmi-sent-ts'] : +new Date().valueOf
  } satisfies Message;

  app.set('messages', { ...messages, twitch: [...messages.twitch, twitchMessage] });
  io.sockets.emit('message', twitchMessage);
});

server.listen(port, () => {
  console.log(`⚡️ [server]: Server is running at http://localhost:${port}`);
});
