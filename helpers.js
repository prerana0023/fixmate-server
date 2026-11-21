import { ObjectId } from "mongodb";

export const isOid = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === String(id);
export const oid = (id) => new ObjectId(id);
// BetterAuth may store _id as ObjectId or string, so match both
export const idFilter = (id) =>
  ObjectId.isValid(id) ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] } : { _id: id };
