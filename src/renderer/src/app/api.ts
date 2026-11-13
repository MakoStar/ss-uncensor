import { cleanError, say } from '../utils/format';

/** 运行异步调用并吞掉异常 */
export async function guard(action: () => Promise<any>): Promise<any> {
  try {
    return await action();
  } catch (err) {
    say('ERRO', cleanError(err.message));
    return null;
  }
}
