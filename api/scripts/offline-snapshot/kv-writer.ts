// Valve KeyValues (KV1) 序列化：VScripts 用 LoadKeyValues 读取。
// KV 没有数组和布尔，调用方负责把数组转成数字键对象、布尔转成 0/1。
export type KvValue = string | number | KvObject;
export interface KvObject {
  [key: string]: KvValue;
}

function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function serializeValue(value: KvValue, indent: string): string {
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(([key, v]) => serializeEntry(key, v, indent + '\t'));
    return `\n${indent}{\n${entries.join('\n')}\n${indent}}`;
  }
  return `"${escape(String(value))}"`;
}

function serializeEntry(key: string, value: KvValue, indent: string): string {
  if (typeof value === 'object') {
    return `${indent}"${escape(key)}"${serializeValue(value, indent)}`;
  }
  return `${indent}"${escape(key)}"\t"${escape(String(value))}"`;
}

export function serializeKvFile(rootKey: string, data: KvObject): string {
  return `"${escape(rootKey)}"${serializeValue(data, '')}\n`;
}
