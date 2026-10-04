import { Injectable } from '@nestjs/common';
import { getStorage } from 'firebase-admin/storage';

const FEEDBACK_BUCKET = 'windy10v10ai-feedback';

@Injectable()
export class FeedbackLogStorageService {
  /** 存一份 gzip 日志，返回 gs:// 路径。 */
  async save(path: string, gzipped: Buffer): Promise<string> {
    // 标成 gzip 编码，控制台下载与 gcloud storage cp 拿到的就是解压后的文本
    await getStorage()
      .bucket(FEEDBACK_BUCKET)
      .file(path)
      .save(gzipped, {
        resumable: false,
        contentType: 'text/plain; charset=utf-8',
        metadata: { contentEncoding: 'gzip' },
      });
    return `gs://${FEEDBACK_BUCKET}/${path}`;
  }
}
