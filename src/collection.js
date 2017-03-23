import { v4 as uuid } from "uuid";

import { capable, toDataBody, isObject } from "./utils";
import * as requests from "./requests";
import endpoint from "./endpoint";

/**
 * Abstract representation of a selected collection.
 *
 */
export default class Collection {
  /**
   * Constructor.
   *
   * @param  {KintoClient}  client            The client instance.
   * @param  {Bucket}       bucket            The bucket instance.
   * @param  {String}       name              The collection name.
   * @param  {Object}       [options={}]      The options object.
   * @param  {Object}       [options.headers] The headers object option.
   * @param  {Boolean}      [options.safe]    The safe option.
   */
  constructor(client, bucket, name, options = {}) {
    /**
     * @ignore
     */
    this.client = client;
    /**
     * @ignore
     */
    this.bucket = bucket;
    /**
     * The collection name.
     * @type {String}
     */
    this.name = name;

    /**
     * The default collection options object, embedding the default bucket ones.
     * @ignore
     * @type {Object}
     */
    this.options = {
      ...this.bucket.options,
      ...options,
      headers: {
        ...(this.bucket.options && this.bucket.options.headers),
        ...options.headers,
      },
    };
    /**
     * @ignore
     */
    this._isBatch = !!options.batch;
  }

  /**
   * Merges passed request options with default bucket and collection ones, if
   * any.
   *
   * @private
   * @param  {Object} [options={}] The options to merge.
   * @return {Object}              The merged options.
   */
  _collOptions(options = {}) {
    const headers = {
      ...(this.options && this.options.headers),
      ...options.headers,
    };
    return {
      ...this.options,
      ...options,
      headers,
    };
  }

  /**
   * Retrieves the total number of records in this collection.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @return {Promise<Number, Error>}
   */
  async getTotalRecords(options = {}) {
    const path = endpoint("record", this.bucket.name, this.name);
    const reqOptions = this._collOptions(options);
    const request = { ...reqOptions, path, method: "HEAD" };
    const { headers } = await this.client.execute(request, { raw: true });
    return parseInt(headers.get("Total-Records"), 10);
  }

  /**
   * Retrieves collection data.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @return {Promise<Object, Error>}
   */
  async getData(options = {}) {
    const reqOptions = this._collOptions(options);
    const path = endpoint("collection", this.bucket.name, this.name);
    const request = { ...reqOptions, path };
    const { data } = await this.client.execute(request);
    return data;
  }

  /**
   * Set collection data.
   * @param  {Object}   data                    The collection data object.
   * @param  {Object}   [options={}]            The options object.
   * @param  {Object}   [options.headers]       The headers object option.
   * @param  {Boolean}  [options.safe]          The safe option.
   * @param  {Boolean}  [options.patch]         The patch option.
   * @param  {Number}   [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async setData(data, options = {}) {
    if (!isObject(data)) {
      throw new Error("A collection object is required.");
    }
    const reqOptions = this._collOptions(options);
    const { permissions } = reqOptions;

    const path = endpoint("collection", this.bucket.name, this.name);
    const request = requests.updateRequest(
      path,
      { data, permissions },
      reqOptions
    );
    return this.client.execute(request);
  }

  /**
   * Retrieves the list of permissions for this collection.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @return {Promise<Object, Error>}
   */
  async getPermissions(options = {}) {
    const path = endpoint("collection", this.bucket.name, this.name);
    const reqOptions = this._collOptions(options);
    const request = { ...reqOptions, path };
    const { permissions } = await this.client.execute(request);
    return permissions;
  }

  /**
   * Replaces all existing collection permissions with the ones provided.
   *
   * @param  {Object}   permissions             The permissions object.
   * @param  {Object}   [options={}]            The options object
   * @param  {Object}   [options.headers]       The headers object option.
   * @param  {Boolean}  [options.safe]          The safe option.
   * @param  {Number}   [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async setPermissions(permissions, options = {}) {
    if (!isObject(permissions)) {
      throw new Error("A permissions object is required.");
    }
    const reqOptions = this._collOptions(options);
    const path = endpoint("collection", this.bucket.name, this.name);
    const data = { last_modified: options.last_modified };
    const request = requests.updateRequest(
      path,
      { data, permissions },
      reqOptions
    );
    return this.client.execute(request);
  }

  /**
   * Creates a record in current collection.
   *
   * @param  {Object}  record                The record to create.
   * @param  {Object}  [options={}]          The options object.
   * @param  {Object}  [options.headers]     The headers object option.
   * @param  {Boolean} [options.safe]        The safe option.
   * @param  {Object}  [options.permissions] The permissions option.
   * @return {Promise<Object, Error>}
   */
  async createRecord(record, options = {}) {
    const reqOptions = this._collOptions(options);
    const { permissions } = reqOptions;
    const path = endpoint("record", this.bucket.name, this.name, record.id);
    const request = requests.createRequest(
      path,
      { data: record, permissions },
      reqOptions
    );
    return this.client.execute(request);
  }

  /**
   * Adds an attachment to a record, creating the record when it doesn't exist.
   *
   * @param  {String}  dataURL                 The data url.
   * @param  {Object}  [record={}]             The record data.
   * @param  {Object}  [options={}]            The options object.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Number}  [options.last_modified] The last_modified option.
   * @param  {Object}  [options.permissions]   The permissions option.
   * @param  {String}  [options.filename]      Force the attachment filename.
   * @param  {String}  [options.gzipped]       Force the attachment to be gzipped or not.
   * @return {Promise<Object, Error>}
   */
  @capable(["attachments"])
  async addAttachment(dataURI, record = {}, options = {}) {
    const reqOptions = this._collOptions(options);
    const { permissions } = reqOptions;
    const id = record.id || uuid.v4();
    const path = endpoint("attachment", this.bucket.name, this.name, id);
    const addAttachmentRequest = requests.addAttachmentRequest(
      path,
      dataURI,
      { data: record, permissions },
      reqOptions
    );
    await this.client.execute(addAttachmentRequest, { stringify: false });
    return this.getRecord(id);
  }

  /**
   * Removes an attachment from a given record.
   *
   * @param  {Object}  recordId                The record id.
   * @param  {Object}  [options={}]            The options object.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Number}  [options.last_modified] The last_modified option.
   */
  @capable(["attachments"])
  async removeAttachment(recordId, options = {}) {
    const reqOptions = this._collOptions(options);
    const path = endpoint("attachment", this.bucket.name, this.name, recordId);
    const request = requests.deleteRequest(path, reqOptions);
    return this.client.execute(request);
  }

  /**
   * Updates a record in current collection.
   *
   * @param  {Object}  record                  The record to update.
   * @param  {Object}  [options={}]            The options object.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Number}  [options.last_modified] The last_modified option.
   * @param  {Object}  [options.permissions]   The permissions option.
   * @return {Promise<Object, Error>}
   */
  async updateRecord(record, options = {}) {
    if (!isObject(record)) {
      throw new Error("A record object is required.");
    }
    if (!record.id) {
      throw new Error("A record id is required.");
    }
    const reqOptions = this._collOptions(options);
    const { permissions } = reqOptions;
    const path = endpoint("record", this.bucket.name, this.name, record.id);
    const request = requests.updateRequest(
      path,
      { data: record, permissions },
      reqOptions
    );
    return this.client.execute(request);
  }

  /**
   * Deletes a record from the current collection.
   *
   * @param  {Object|String} record                  The record to delete.
   * @param  {Object}        [options={}]            The options object.
   * @param  {Object}        [options.headers]       The headers object option.
   * @param  {Boolean}       [options.safe]          The safe option.
   * @param  {Number}        [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async deleteRecord(record, options = {}) {
    const recordObj = toDataBody(record);
    if (!recordObj.id) {
      throw new Error("A record id is required.");
    }
    const { id, last_modified } = recordObj;
    const reqOptions = this._collOptions({ last_modified, ...options });
    const path = endpoint("record", this.bucket.name, this.name, id);
    const request = requests.deleteRequest(path, reqOptions);
    return this.client.execute(request);
  }

  /**
   * Retrieves a record from the current collection.
   *
   * @param  {String} id                The record id to retrieve.
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @return {Promise<Object, Error>}
   */
  async getRecord(id, options = {}) {
    const path = endpoint("record", this.bucket.name, this.name, id);
    const reqOptions = this._collOptions(options);
    const request = { ...reqOptions, path };
    return this.client.execute(request);
  }

  /**
   * Lists records from the current collection.
   *
   * Sorting is done by passing a `sort` string option:
   *
   * - The field to order the results by, prefixed with `-` for descending.
   * Default: `-last_modified`.
   *
   * @see http://kinto.readthedocs.io/en/stable/api/1.x/sorting.html
   *
   * Filtering is done by passing a `filters` option object:
   *
   * - `{fieldname: "value"}`
   * - `{min_fieldname: 4000}`
   * - `{in_fieldname: "1,2,3"}`
   * - `{not_fieldname: 0}`
   * - `{exclude_fieldname: "0,1"}`
   *
   * @see http://kinto.readthedocs.io/en/stable/api/1.x/filtering.html
   *
   * Paginating is done by passing a `limit` option, then calling the `next()`
   * method from the resolved result object to fetch the next page, if any.
   *
   * @param  {Object}   [options={}]                    The options object.
   * @param  {Object}   [options.headers]               The headers object option.
   * @param  {Object}   [options.filters=[]]            The filters object.
   * @param  {String}   [options.sort="-last_modified"] The sort field.
   * @param  {String}   [options.at]                    The timestamp to get a snapshot at.
   * @param  {String}   [options.limit=null]            The limit field.
   * @param  {String}   [options.pages=1]               The number of result pages to aggregate.
   * @param  {Number}   [options.since=null]            Only retrieve records modified since the provided timestamp.
   * @return {Promise<Object, Error>}
   */
  async listRecords(options = {}) {
    const path = endpoint("record", this.bucket.name, this.name);
    const reqOptions = this._collOptions(options);
    if (options.hasOwnProperty("at")) {
      return this.getSnapshot(options.at);
    } else {
      return this.client.paginatedList(path, options, reqOptions);
    }
  }

  /**
   * @private
   */
  async isHistoryComplete() {
    // We consider that if we have the collection creation event part of the
    // history, then all records change events have been tracked.
    const { data: [oldestHistoryEntry] } = await this.bucket.listHistory({
      limit: 1,
      filters: {
        action: "create",
        resource_name: "collection",
        collection_id: this.name,
      },
    });
    return !!oldestHistoryEntry;
  }

  /**
   * @private
   */
  async listChangesBackTo(at) {
    // Ensure we have enough history data to retrieve the complete list of
    // changes.
    if (!await this.isHistoryComplete()) {
      throw new Error(
        "Computing a snapshot is only possible when the full history for a " +
          "collection is available. Here, the history plugin seems to have " +
          "been enabled after the creation of the collection."
      );
    }
    const { data: changes } = await this.bucket.listHistory({
      pages: Infinity, // all pages up to target timestamp are required
      sort: "-target.data.last_modified",
      filters: {
        resource_name: "record",
        collection_id: this.name,
        "max_target.data.last_modified": String(at), // eq. to <=
      },
    });
    return changes;
  }

  /**
   * @private
   */
  @capable(["history"])
  async getSnapshot(at) {
    if (!Number.isInteger(at) || at <= 0) {
      throw new Error("Invalid argument, expected a positive integer.");
    }
    // Retrieve history and check it covers the required time range.
    const changes = await this.listChangesBackTo(at);
    // Replay changes to compute the requested snapshot.
    const seenIds = new Set();
    let snapshot = [];
    for (const { action, target: { data: record } } of changes) {
      if (action == "delete") {
        seenIds.add(record.id); // ensure not reprocessing deleted entries
        snapshot = snapshot.filter(r => r.id !== record.id);
      } else if (!seenIds.has(record.id)) {
        seenIds.add(record.id);
        snapshot.push(record);
      }
    }
    return {
      last_modified: String(at),
      data: snapshot.sort((a, b) => b.last_modified - a.last_modified),
      next: () => {
        throw new Error("Snapshots don't support pagination");
      },
      hasNextPage: false,
      totalRecords: snapshot.length,
    };
  }

  /**
   * Performs batch operations at the current collection level.
   *
   * @param  {Function} fn                   The batch operation function.
   * @param  {Object}   [options={}]         The options object.
   * @param  {Object}   [options.headers]    The headers object option.
   * @param  {Boolean}  [options.safe]       The safe option.
   * @param  {Boolean}  [options.aggregate]  Produces a grouped result object.
   * @return {Promise<Object, Error>}
   */
  async batch(fn, options = {}) {
    const reqOptions = this._collOptions(options);
    return this.client.batch(fn, {
      ...reqOptions,
      bucket: this.bucket.name,
      collection: this.name,
    });
  }
}
