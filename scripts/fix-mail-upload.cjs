const {Client}=require('basic-ftp');
const fs=require('fs');
const path=require('path');
require('./lib/load-project-env.cjs').loadProjectEnv();
const file=path.join(__dirname,'..','send-email.php');
async function tryOne(id,host,user,pass){
  if(!host||!user||!pass) return;
  const c=new Client(30000);
  try{
    await c.access({host,user,password:pass,secure:true,secureOptions:{rejectUnauthorized:false}});
    console.log(`[${id}] connected pwd=${await c.pwd()}`);
    let list=await c.list();
    console.log(`[${id}] root entries: ${list.map(e=>e.name).slice(0,15).join(',')}`);
    // try public_html
    try{
      await c.ensureDir('public_html');
      console.log(`[${id}] ensure public_html ok`);
      await c.uploadFrom(file,'send-email.php');
      console.log(`[${id}] uploaded to public_html/send-email.php OK`);
    }catch(e){ console.log(`[${id}] public_html err`,e.message)}
    // also try to ensure mail dir if exists
    try{
      await c.ensureDir('/public_html/mail');
      await c.uploadFrom(file,'send-email.php');
      console.log(`[${id}] uploaded to public_html/mail OK`);
    }catch(e){ console.log(`[${id}] mail dir err`,e.message)}
    // also try root
    try{
      await c.cd('/');
      await c.uploadFrom(file,'send-email.php');
      console.log(`[${id}] uploaded to / OK`);
    }catch(e){ console.log(`[${id}] root upload err`,e.message)}
    c.close();
  }catch(e){ console.error(`[${id}] fail`,e.message); try{c.close()}catch{}}
}
(async()=>{
  await tryOne('MQ',process.env.FTP_HOST_MQ,process.env.FTP_USER_MQ,process.env.FTP_PASS_MQ);
})();
