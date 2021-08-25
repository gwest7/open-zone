
import { exec } from 'child_process';

export function ping(host:string) {
  return exec(`ping -c 3 ${host}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
}