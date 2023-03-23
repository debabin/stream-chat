import express from 'express';
import { google } from 'googleapis';

import type { Message } from '../utils/types';

const router = express.Router();
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:3001/youtube/oauthcallback'
);

router.get('/auth', async (_req, res) => {
  try {
    const accessToken = await oauth2Client.getAccessToken();
    return res.send({ success: !!accessToken });
  } catch (e) {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    });

    return res.send({ url });
  }
});

router.get('/oauthcallback', async (req, res) => {
  if (!req.query.code) return res.send();
  const { tokens } = await oauth2Client.getToken(req.query.code as string);
  oauth2Client.setCredentials(tokens);

  google.options({
    auth: oauth2Client
  });

  const io = req.app.get('socketio');
  io.sockets.emit('googleAuth', { success: true });
  res.send('<script>window.close();</script>');
});

let isPollingOn = false;
router.get('/initPoling', async (req, res) => {
  if (isPollingOn) return res.send();

  try {
    const youtube = google.youtube({ version: 'v3' });
    const liveBroadcasts = await youtube.liveBroadcasts.list({
      broadcastStatus: 'active',
      part: ['snippet', 'status', 'contentDetails', 'id']
    });

    const activeliveBroadcast = liveBroadcasts.data.items?.at(-1);

    if (!activeliveBroadcast?.snippet?.liveChatId) {
      return;
    }

    const liveChatMessagesParams = {
      maxResults: 2000,
      part: ['snippet', 'authorDetails', 'id']
    };

    const liveChatMessagesFn = (liveChatId: string) =>
      youtube.liveChatMessages
        .list({ ...liveChatMessagesParams, liveChatId })
        .then((liveChatMessages) => {
          if (!liveChatMessages.data.items) {
            return res.send();
          }

          const io = req.app.get('socketio');

          const messages = liveChatMessages.data.items.map(
            (message) =>
              ({
                publishedTime: message.snippet?.publishedAt
                  ? new Date(message.snippet?.publishedAt).valueOf()
                  : new Date().valueOf(),
                platform: 'youtube',
                username: message.authorDetails?.displayName ?? 'undefined',
                text: message.snippet?.textMessageDetails?.messageText ?? 'undefined'
              } satisfies Message)
          );

          const pollingTime = 10000;

          const youTubeMessages = req.app.get('messages').youtube;
          if (youTubeMessages.length === messages.length) {
            if (!liveChatMessages.data.pollingIntervalMillis) return;

            setTimeout(() => liveChatMessagesFn(liveChatId), pollingTime);
            return;
          }
          req.app.set('messages', {
            ...req.app.get('messages'),
            youtube: [...youTubeMessages, ...messages.slice(youTubeMessages.length)]
          });

          io.sockets.emit('messages', messages.slice(youTubeMessages.length));
          if (!liveChatMessages.data.pollingIntervalMillis) return;

          setTimeout(
            () => liveChatMessagesFn(liveChatId),
            // liveChatMessages.data.pollingIntervalMillis
            pollingTime
          );
        });

    liveChatMessagesFn(activeliveBroadcast.snippet.liveChatId);
    isPollingOn = true;
    return res.send();
  } catch (e) {
    console.log(e);
  }
});

export const youTubeRouter = router;
