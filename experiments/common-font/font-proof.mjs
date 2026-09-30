import { renderToSVGNative, closeNativeRenderer } from '../../src/svg-browser.mjs';
import fs from 'node:fs/promises';
try {
 const result = await renderToSVGNative(String.raw`\sqrt{x^2+1}`, {fontSize:28, displayMode:false});
 await fs.writeFile(process.argv[2], result.svg);
 console.log(JSON.stringify({fontSha256:result.fontSha256,width:result.width,height:result.height,baseline:result.baseline}));
}finally{await closeNativeRenderer();}
