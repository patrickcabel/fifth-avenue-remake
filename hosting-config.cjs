function hostingConfig(env){
  const port=Number(env.PORT || 3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be a valid TCP port.');
  const supplied=env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL;
  let publicOrigin=null;
  if(supplied){const url=new URL(supplied);if(url.protocol!=='https:')throw Error('Hosted access requires an HTTPS public origin.');publicOrigin=url.origin;}
  if(env.RENDER==='true'&&!publicOrigin)throw Error('RENDER_EXTERNAL_URL or PUBLIC_ORIGIN is required.');
  const origins=new Set(['http://localhost:'+port,'http://127.0.0.1:'+port,...(publicOrigin?[publicOrigin]:[])]);
  return {port,publicOrigin,demoMode:env.DEMO_MODE==='true',allowedHosts:new Set([...origins].map(o=>new URL(o).host)),allowedOrigins:origins};
}
module.exports={hostingConfig};
