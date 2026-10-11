// Preserve real Node test failures, including non-enumerable Error causes.
function serializable(value) {
 if(value instanceof Error)return Object.fromEntries(Object.getOwnPropertyNames(value).map(key=>[key,serializable(value[key])]));
 if(Array.isArray(value))return value.map(serializable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,serializable(item)]));
 return value;
}
export default async function* reporter(source) {
 for await(const event of source)if(['test:pass','test:fail','test:summary','test:diagnostic'].includes(event.type))yield JSON.stringify(serializable(event))+'\n';
}
