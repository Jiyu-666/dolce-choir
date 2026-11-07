import {test,expect} from "vitest";
import {maintainerId,newShareToken,validShareToken,shareTokenHash,readLimitedBody} from "../../src/choir/share-contract";
test("only a verified Github identity ID grants maintainer status",()=>{
 expect(maintainerId({id:"owner",identities:[{provider:"github",identity_data:{sub:"138117377"}}]})).toBe("owner");
 expect(maintainerId({id:"owner",user_metadata:{sub:"138117377",role:"maintainer"},identities:[{provider:"email",identity_data:{sub:"138117377"}}]})).toBeNull();
 expect(maintainerId({id:"owner",identities:[{provider:"github",identity_data:{sub:"2",login:"Jiyu-666"}}]})).toBeNull();
});
test("browser tokens contain192 random bits and only hashes are stored by the contract",async()=>{
 const token=newShareToken();expect(validShareToken(token)).toBe(true);expect(token).toHaveLength(32);expect(await shareTokenHash(token)).toMatch(/^[0-9a-f]{64}$/);expect(await shareTokenHash(token)).not.toContain(token);
 expect(validShareToken("short")).toBe(false);await expect(shareTokenHash("short")).rejects.toThrow();
});
test("request body limits count streamed bytes rather than trusting content length",async()=>{
 const request=new Request("http://localhost",{method:"POST",body:new Uint8Array(10),headers:{"content-length":"1"}});
 await expect(readLimitedBody(request,5)).rejects.toThrow(/large/);
});
