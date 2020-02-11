import url from 'url';
import { EventEmitter } from 'events';
import chromeStorage from '../utils/storage';
import EVENTS from '../constants/events';

export type WebRequestBodyDetails = chrome.webRequest.WebRequestBodyDetails;
export type BlockingResponse = chrome.webRequest.BlockingResponse;

export const ALLOW_REQUEST: BlockingResponse = { cancel: false };
export const BLOCK_REQUEST: BlockingResponse = { cancel: true };

type Listener = (props: { audioUrl: string; details: WebRequestBodyDetails }) => void;

class VideoRequestService extends EventEmitter {
  private shouldBlockRequest: boolean;
  private isServiceActive: boolean;

  constructor() {
    super();
    this.init();
    this.loadConfig();
    this.processHttpRequests();
  }

  private init(): void {
    this.shouldBlockRequest = false;
    this.isServiceActive = false;
  }

  private loadConfig(): void {
    chromeStorage.get('enableAudioMode').then(data => {
      const { enableAudioMode } = data;
      this.shouldBlockRequest = enableAudioMode === 'true';
    });
  }

  private processHttpRequests(): void {
    chrome.webRequest.onBeforeRequest.addListener(
      details => {
        if (!this.isServiceActive) {
          return ALLOW_REQUEST;
        }

        const { initiator, type } = details;
        if (type !== 'xmlhttprequest') {
          return ALLOW_REQUEST;
        }

        if (initiator.match(/youtube\.com/) === null) {
          return ALLOW_REQUEST;
        }

        const { url: requestUrl } = details;
        if (requestUrl.match(/mime=audio%2Fwebm/) === null) {
          return this.shouldBlockRequest ? BLOCK_REQUEST : ALLOW_REQUEST;
        }

        const parsedRequest = url.parse(requestUrl, true);
        const { query } = parsedRequest;
        const filteredQuery = { ...query };
        delete filteredQuery['range'];
        delete filteredQuery['rbuf'];
        delete filteredQuery['rn'];

        const audioUrl: string = url.format({
          ...parsedRequest,
          search: null,
          query: filteredQuery,
        });

        this.emit(EVENTS.RECEIVE_AUDIO_URL, { audioUrl, details });
        return ALLOW_REQUEST;
      },
      { urls: ['*://*.googlevideo.com/*'] },
      ['blocking'],
    );
  }

  onReceiveAudio(listener: Listener): void {
    super.on(EVENTS.RECEIVE_AUDIO_URL, listener);
  }

  start(): void {
    this.isServiceActive = true;
  }

  end(): void {
    this.isServiceActive = false;
  }

  blockVideos(): void {
    this.shouldBlockRequest = true;
  }

  unblockVideos(): void {
    this.shouldBlockRequest = false;
  }

  isActive(): boolean {
    return this.isServiceActive;
  }
}

export default new VideoRequestService();
