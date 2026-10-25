import type {Host} from './types';

// Display fixtures only. Never auto-connect or store credentials.
export const demoHosts:Host[] = [
 {id:'cb018d2e-73b4-4000-8000-000000000001',name:'Arctic API',host:'api.dev.example.test',port:22,username:'developer',group:'개발',tags:['demo','api','node'],favorite:true,authMethod:'key'},
 {id:'cb018d2e-73b4-4000-8000-000000000002',name:'Snowflake DB',host:'db.dev.example.test',port:2222,username:'postgres',group:'개발',tags:['demo','postgres','database'],authMethod:'password'},
 {id:'cb018d2e-73b4-4000-8000-000000000003',name:'Glacier Web',host:'web.staging.example.test',port:22,username:'deploy',group:'스테이징',tags:['demo','web','preview'],authMethod:'key'},
 {id:'cb018d2e-73b4-4000-8000-000000000004',name:'Aurora Worker',host:'worker.staging.example.test',port:22,username:'runner',group:'스테이징',tags:['demo','queue','worker'],authMethod:'key'},
 {id:'cb018d2e-73b4-4000-8000-000000000005',name:'Polaris Gateway',host:'gateway.prod.example.test',port:2222,username:'ops',group:'운영',tags:['demo','gateway','nginx'],favorite:true,authMethod:'key'},
 {id:'cb018d2e-73b4-4000-8000-000000000006',name:'Northstar Monitor',host:'monitor.prod.example.test',port:22,username:'monitor',group:'운영',tags:['demo','grafana','metrics'],authMethod:'key'},
 {id:'cb018d2e-73b4-4000-8000-000000000007',name:'Iceberg NAS',host:'nas.home.example.test',port:22,username:'polar',group:'홈랩',tags:['demo','storage','backup'],favorite:true,authMethod:'password'},
 {id:'cb018d2e-73b4-4000-8000-000000000008',name:'Tundra Mini',host:'mini.home.example.test',port:2200,username:'polar',group:'홈랩',tags:['demo','docker','linux'],authMethod:'key'},
];
