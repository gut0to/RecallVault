import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { MemoryStore } from '../dist/index.js';
const vault=fs.mkdtempSync(path.join(os.tmpdir(),'recallvault-bench-')),store=new MemoryStore(vault);
try{
 const records=Array.from({length:100},(_,i)=>({project:'benchmark',title:'Decision '+i,content:'SQLite offline record '+i,kind:'decision',sources:[{reference:'synthetic:'+i}]}));
 const start=performance.now();store.rememberBatch(records,false);const writeMs=performance.now()-start;
 const samples=[];for(let i=0;i<10;i++){const begin=performance.now();store.search({project:'benchmark',query:'offline'});samples.push(performance.now()-begin);}
 samples.sort((a,b)=>a-b);console.log(JSON.stringify({memories:records.length,batchWriteMs:writeMs,medianRecallMs:samples[Math.floor(samples.length/2)],scope:'Synthetic managed notes, local filesystem, lexical retrieval; not a performance guarantee'},null,2));
}finally{store.close();fs.rmSync(vault,{recursive:true,force:true});}
