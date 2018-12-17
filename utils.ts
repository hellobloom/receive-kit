import _ from "lodash";

export const isNullOrWhiteSpace = (value: any): boolean =>
  typeof value !== "string" || value.trim() === "";

// Implementation from http://whitfin.io/sorting-object-recursively-node-jsjavascript/
export function sortObject<T>(object: any): T {
  let sortedObj: any = {};
  let keys = _.keys(object);
  keys = _.sortBy(keys, (key: string) => {
    return key;
  });

  _.each(keys, (key: string) => {
    if (typeof object[key] === "object" && !(object[key] instanceof Array)) {
      sortedObj[key] = sortObject(object[key]);
    } else {
      sortedObj[key] = object[key];
    }
  });

  return sortedObj as T;
}
