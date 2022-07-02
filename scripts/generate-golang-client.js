const fsExtra = require('fs-extra');
const exec = require('child_process');
const {exit} = require('process');

const outputTarget = 'client/golang';

console.log('emptying output target directory ...');
fsExtra.emptyDirSync(outputTarget);

console.log('regenerating sources ...');
const cmd = exec.spawn(
  'openapi-generator-cli',
  [
    'generate',
    '-i',
    'dist/openapi-spec.json',
    '-g',
    'go',
    '-o',
    outputTarget,
    '--additional-properties=generateInterfaces=true,packageName=storagegatewayclient',
    '-t',
    'scripts/templates/client-golang',
  ],
  {
    shell: true,
  },
);

cmd.stdout.on('data', data => {
  console.log(`> ${data}`);
});

cmd.stderr.on('data', data => {
  console.log(`E> ${data}`);
});

cmd.on('error', error => {
  console.error(`error: ${error.message}`, error);
});

cmd.on('close', code => {
  console.log(`child process exited with code ${code}`);
  exit(code);
});
