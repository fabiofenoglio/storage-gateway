import {Client, expect} from '@loopback/testlab';
import fs from 'fs-extra';
import {StorageGatewayApplication} from '../../../application';
import {UploadFolderCleanupCronJob} from '../../../cronjobs/upload-folder-cleanup.cronjob';
import {
  getCronjob,
  setupApplication,
  testConfig,
} from '../../helper/test-helper';

describe('Upload cleanup batch', () => {
  let app: StorageGatewayApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    expect(app).to.not.be.undefined();
    expect(client).to.not.be.undefined();
  });

  after(async () => {
    await app.stop();
  });

  const getJob = async () => {
    const job = (await getCronjob(
      app,
      'UploadFolderCleanupCronJob',
    )) as UploadFolderCleanupCronJob;
    expect(job).to.not.be.undefined();
    return job;
  };

  it('cleans the upload folder', async () => {
    const job = await getJob();

    const dateOfToday = new Date().toISOString().substr(0, 10);
    const dateOfTwoDaysAgo = new Date(
      new Date().getTime() - 2 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .substr(0, 10);
    const uploadFolder = testConfig.upload.location;

    await fs.emptyDir(uploadFolder);

    await fs.mkdirp(uploadFolder + '/folder1'); // should remain
    await fs.mkdirp(uploadFolder + '/folder2'); // should remain
    await fs.createFile(uploadFolder + '/test1.txt'); // should remain
    await fs.createFile(uploadFolder + '/test2.txt'); // should remain

    await fs.mkdirp(uploadFolder + '/2000-01-01/a/b/c'); // should be removed
    await fs.createFile(uploadFolder + '/2000-01-01/a/test1.txt');
    await fs.createFile(uploadFolder + '/2000-01-01/a/test2.txt');

    await fs.mkdirp(uploadFolder + '/2000-02-01'); // should be removed
    await fs.createFile(uploadFolder + '/2000-02-01/test1.txt');

    await fs.mkdirp(uploadFolder + '/2000-03-01'); // should be removed
    await fs.mkdirp(uploadFolder + '/' + dateOfTwoDaysAgo); // should remain
    await fs.mkdirp(uploadFolder + '/' + dateOfToday); // should remain
    // this will break tests in 100 years, to be fixed if I'll be programming when retired
    await fs.mkdirp(uploadFolder + '/2099-03-01'); // should remain

    const before = await fs.promises.readdir(uploadFolder);
    expect(before.length).to.eql(10);

    await job.forceExecution();

    const leftover = await fs.promises.readdir(uploadFolder);
    expect(leftover.length).to.eql(7);

    expect(leftover.includes('folder1')).to.be.true();
    expect(leftover.includes('folder2')).to.be.true();
    expect(leftover.includes('test1.txt')).to.be.true();
    expect(leftover.includes('test2.txt')).to.be.true();
    expect(leftover.includes(dateOfTwoDaysAgo)).to.be.true();
    expect(leftover.includes(dateOfToday)).to.be.true();
    expect(leftover.includes('2099-03-01')).to.be.true();
  });
});
