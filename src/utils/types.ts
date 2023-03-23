export type Message = {
  text: string;
  username: string;
  platform: 'twitch' | 'youtube';
  publishedTime: number;
  image?: {
    alt: string;
    src: string;
  };
};
