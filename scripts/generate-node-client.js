const fsExtra = require('fs-extra');
const exec = require('child_process');
const {exit} = require('process');

const outputTarget = 'client/node';

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
    'typescript-fetch',
    '-o',
    outputTarget,
    '--additional-properties=npmName=storage-gateway-client-node,typescriptThreePlus=true,prefixParameterInterfaces=true',
    '-t',
    'scripts/templates/client-node',
    '--type-mappings=AnyType=Object',
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
