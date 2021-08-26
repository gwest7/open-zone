
import { exec } from 'child_process';

export function ping(host:string) {
  if (!host || typeof(host) !== 'string') {
    return null;
  }
  return exec(`ping -c 3 ${host}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.info(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
}