import { cleanError, say } from '../utils/format'

/* 统一捕获异步操作异常并提示 */
export async function guard(action) {
  try {
    return await action();
  } catch (err) {
    say('ERRO', cleanError(err.message));
    return null;
  }
}
