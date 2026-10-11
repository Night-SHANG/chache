import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

type XmlElement={tag:string;attributes:Record<string,string>;children:XmlElement[]};
const android='{http://schemas.android.com/apk/res/android}';
const resources='android/app/src/main/res/xml/';
const domains=['root','file','database','sharedpref','external','device_root','device_file','device_database','device_sharedpref'].sort();

function parseXml(path:string):XmlElement{
 const parsed=spawnSync('python3',['-c',`
import json, sys, xml.etree.ElementTree as ET
def element(node):
    return {"tag": node.tag, "attributes": node.attrib, "children": [element(child) for child in node]}
print(json.dumps(element(ET.parse(sys.argv[1]).getroot())))
`,path],{encoding:'utf8',timeout:10000});
 assert.equal(parsed.status,0,`${path}: ${parsed.stdout}${parsed.stderr}`);
 return JSON.parse(parsed.stdout) as XmlElement;
}

function assertAllDomainsExcluded(section:XmlElement){
 assert.deepEqual(section.children.map(child=>({
  tag:child.tag,attributes:child.attributes,children:child.children
 })).sort((a,b)=>a.attributes.domain.localeCompare(b.attributes.domain)),
 domains.map(domain=>({tag:'exclude',attributes:{domain,path:'.'},children:[]})),
 `${section.tag} must exclude every credential/device-protected and external domain, without includes`);
}

test('Android backup policy explicitly excludes all app data from legacy backup, cloud backup and device transfer',()=>{
 const manifest=parseXml('android/app/src/main/AndroidManifest.xml');
 const application=manifest.children.find(child=>child.tag==='application');
 assert.ok(application,'Application manifest entry is missing');
 assert.equal(application.attributes[`${android}allowBackup`],'false');
 assert.equal(application.attributes[`${android}dataExtractionRules`],'@xml/data_extraction_rules',
  'Android 12+ needs explicit transfer rules even when allowBackup is false');
 assert.equal(application.attributes[`${android}fullBackupContent`],'@xml/backup_rules');

 const legacy=parseXml(`${resources}backup_rules.xml`);
 assert.equal(legacy.tag,'full-backup-content');
 assertAllDomainsExcluded(legacy);

 const extraction=parseXml(`${resources}data_extraction_rules.xml`);
 assert.equal(extraction.tag,'data-extraction-rules');
 assert.deepEqual(extraction.children.map(child=>child.tag).sort(),['cloud-backup','device-transfer']);
 for(const section of extraction.children)assertAllDomainsExcluded(section);
});
