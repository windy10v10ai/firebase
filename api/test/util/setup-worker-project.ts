// 并行的 jest worker 共用同一个模拟器实例。project 不分开的话，一个套件的全库级写操作
// （批量重置属性加点的运维接口就是其中之一）会删掉另一个套件正在用的文档，
// 套件之间撞 steamId 也会互相覆盖。模拟器按 project 隔离数据，用 worker 编号切出各自的 project。
//
// 只切 Firestore：Auth 模拟器按启动时的 project 签发 ID Token，跟着切会验不过签。
process.env.FIRESTORE_PROJECT_ID = `windy10v10ai-e2e-${process.env.JEST_WORKER_ID ?? '1'}`;

export {};
