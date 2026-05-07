/**
 * 支付宝异步通知字段（application/x-www-form-urlencoded）
 *
 * 仅声明业务必需的字段，其他字段一并保留在 rawNotify 中。
 * 字段名与支付宝下行参数保持一致（snake_case）。
 *
 * 参考：https://opendocs.alipay.com/open/204/105301
 */
export interface AlipayNotifyDto {
  notify_id?: string;
  notify_type?: string;
  notify_time?: string;
  app_id?: string;
  sign?: string;
  sign_type?: string;
  out_trade_no?: string;
  trade_no?: string;
  trade_status?: string;
  total_amount?: string;
  buyer_id?: string;
  buyer_logon_id?: string;
  gmt_payment?: string;
  [key: string]: string | undefined;
}
