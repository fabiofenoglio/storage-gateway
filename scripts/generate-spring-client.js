const fsExtra = require('fs-extra');
const exec = require('child_process');
const {exit} = require('process');

const outputTarget = 'client/spring';
const artifactVersion = '0.0.1-SNAPSHOT';

console.log('emptying output target directory ...');
fsExtra.emptyDirSync(outputTarget + '/api');
fsExtra.emptyDirSync(outputTarget + '/docs');
fsExtra.emptyDirSync(outputTarget + '/src/main');
fsExtra.emptyDirSync(outputTarget + '/target');
fsExtra.emptyDirSync(outputTarget + '/bin');
fsExtra.removeSync(outputTarget + '/pom.xml');

console.log('regenerating sources ...');
const cmd = exec.spawn(
  'openapi-generator-cli',
  [
    'generate',
    '-i',
    'dist/openapi-spec.json',
    '--api-package',
    'it.fabiofenoglio.storagegateway.api',
    '--model-package',
    'it.fabiofenoglio.storagegateway.model',
    '--invoker-package',
    'it.fabiofenoglio.storagegateway.invoker',
    '--group-id',
    'it.fabiofenoglio.protoms',
    '--artifact-id',
    'storagegateway-client',
    '--artifact-version',
    artifactVersion,
    '-g',
    'java',
    '-p',
    'java8=true',
    '--library',
    'resttemplate',
    '--type-mappings=AnyType=Object',
    '-t',
    'scripts/templates/client-spring',
    '-c',
    'scripts/config/generate-java.json',
    '-o',
    outputTarget,
    '-DmodelTests=false',
    '-DmodelDocs=false',
    '-DskipFormModel=false',
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
