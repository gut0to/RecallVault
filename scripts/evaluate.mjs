import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { MemoryStore } from '../dist/index.js';
const dataset = JSON.parse(fs.readFileSync(new URL('../evaluation/retrieval.json',import.meta.url),'utf8'));
const vault=fs.mkdtempSync(path.join(os.tmpdir(),'recallvault-eval-')),store=new MemoryStore(vault);
try {
 const labels=new Map();
 for(const {label,...input} of dataset.memories) labels.set(store.remember(input).memory.id,label);
 let recall=0,rank=0,scored=0;
 for(const query of dataset.queries){
   const result=store.search(query.input),actual=result.results.map(m=>labels.get(m.id));
   assert.ok(result.results.every(m=>m.project===query.input.project),'Project leakage');
   if(!query.expected.length)assert.equal(actual.length,0,JSON.stringify(query.input));
   else {scored++;const hits=query.expected.filter(label=>actual.includes(label));recall+=hits.length/query.expected.length;const first=actual.findIndex(label=>query.expected.includes(label));rank+=first<0?0:1/(first+1);assert.ok(hits.length>0,'Missed '+JSON.stringify(query.input));}
 }
 console.log(JSON.stringify({queries:dataset.queries.length,recallAt5:recall/scored,meanReciprocalRank:rank/scored,projectLeaks:0},null,2));
}finally{store.close();fs.rmSync(vault,{recursive:true,force:true});}
