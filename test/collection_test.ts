"use strict";

import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import KintoClient from "../src";
import Bucket from "../src/bucket";
import Collection, { CollectionOptions } from "../src/collection";
import * as requests from "../src/requests";
import { fakeServerResponse } from "./test_utils";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const FAKE_SERVER_URL = "http://fake-server/v1";

/** @test {Collection} */
describe("Collection", () => {
  let sandbox: sinon.SinonSandbox, client: KintoClient, coll: Collection;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    client = new KintoClient(FAKE_SERVER_URL);
    const bucket = new Bucket(client, "blog", { headers: { Foo: "Bar" } });
    coll = new Collection(client, bucket, "posts", { headers: { Baz: "Qux" } });
  });

  afterEach(() => {
    sandbox.restore();
  });

  function getBlogPostsCollection(options?: CollectionOptions) {
    return new Bucket(client, "blog").collection("posts", options);
  }

  /** @test {Collection#getTotalRecords} */
  describe("#getTotalRecords()", () => {
    it("should execute expected request", () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve());

      getBlogPostsCollection().getTotalRecords();

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "HEAD",
          path: "/buckets/blog/collections/posts/records",
          headers: {},
        },
        { raw: true }
      );
    });

    it("should resolve with the Total-Records header value", () => {
      sandbox.stub(client, "execute").returns(
        Promise.resolve({
          headers: {
            get() {
              return 42;
            },
          },
        })
      );

      return getBlogPostsCollection()
        .getTotalRecords()
        .should.become(42);
    });
  });

  /** @test {Collection#getData} */
  describe("#getData()", () => {
    it("should execute expected request", () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve());

      getBlogPostsCollection().getData();

      sinon.assert.calledWithMatch(executeStub, {
        path: "/buckets/blog/collections/posts",
        headers: {},
      });
    });

    it("should resolve with response data", () => {
      const response = { data: { foo: "bar" } };
      sandbox.stub(client, "execute").returns(Promise.resolve(response));

      return getBlogPostsCollection()
        .getData()
        .should.become({ foo: "bar" });
    });

    it("should pass query through", () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve());

      getBlogPostsCollection().getData({ query: { _expected: '"123"' } });

      sinon.assert.calledWithMatch(executeStub, {
        path: "/buckets/blog/collections/posts?_expected=%22123%22",
        headers: {},
      });
    });

    it("supports _fields", () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve());

      getBlogPostsCollection().getData({ fields: ["a", "b"] });

      sinon.assert.calledWithMatch(executeStub, {
        path: "/buckets/blog/collections/posts?_fields=a,b",
        headers: {},
      });
    });
  });

  /** @test {Collection#getPermissions} */
  describe("#getPermissions()", () => {
    beforeEach(() => {
      sandbox.stub(client, "execute").returns(
        Promise.resolve({
          data: {},
          permissions: { write: ["fakeperms"] },
        })
      );
    });

    it("should retrieve permissions", () => {
      return coll.getPermissions().should.become({ write: ["fakeperms"] });
    });
  });

  /** @test {Collection#setPermissions} */
  describe("#setPermissions()", () => {
    const fakePermissions = { read: [], write: [] };
    let updateRequestStub: sinon.SinonStub;

    beforeEach(() => {
      updateRequestStub = sandbox.stub(requests, "updateRequest");
      sandbox.stub(client, "execute").returns(Promise.resolve({}));
    });

    it("should set permissions", () => {
      coll.setPermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts",
        { data: { last_modified: undefined }, permissions: fakePermissions },
        { headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should handle the safe option", () => {
      coll.setPermissions(fakePermissions, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts",
        { data: { last_modified: 42 }, permissions: fakePermissions },
        { headers: { Foo: "Bar", Baz: "Qux" }, safe: true }
      );
    });

    it("should resolve with json result", () => {
      return coll.setPermissions(fakePermissions).should.become({});
    });
  });

  /** @test {Collection#addPermissions} */
  describe("#addPermissions()", () => {
    const fakePermissions = { read: [], write: [] };
    let jsonPatchPermissionsRequestStub: sinon.SinonStub;

    beforeEach(() => {
      jsonPatchPermissionsRequestStub = sandbox.stub(
        requests,
        "jsonPatchPermissionsRequest"
      );
      sandbox.stub(client, "execute").returns(Promise.resolve({}));
    });

    it("should append permissions", () => {
      coll.addPermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        jsonPatchPermissionsRequestStub,
        "/buckets/blog/collections/posts",
        fakePermissions,
        "add",
        { headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should handle the safe option", () => {
      coll.addPermissions(fakePermissions, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        jsonPatchPermissionsRequestStub,
        "/buckets/blog/collections/posts",
        fakePermissions,
        "add",
        { headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should resolve with json result", () => {
      return coll.setPermissions(fakePermissions).should.become({});
    });
  });

  /** @test {Collection#removePermissions} */
  describe("#removePermissions()", () => {
    const fakePermissions = { read: [], write: [] };
    let updateRequestStub: sinon.SinonStub;

    beforeEach(() => {
      updateRequestStub = sandbox.stub(requests, "updateRequest");
      sandbox.stub(client, "execute").returns(Promise.resolve({}));
    });

    it("should pop permissions", () => {
      coll.setPermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts",
        { data: { last_modified: undefined }, permissions: fakePermissions },
        { headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should handle the safe option", () => {
      coll.setPermissions(fakePermissions, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts",
        { data: { last_modified: 42 }, permissions: fakePermissions },
        { headers: { Foo: "Bar", Baz: "Qux" }, safe: true }
      );
    });

    it("should resolve with json result", () => {
      return coll.setPermissions(fakePermissions).should.become({});
    });
  });

  /** @test {Collection#getData} */
  describe("#getData()", () => {
    beforeEach(() => {
      sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: { a: 1 } }));
    });

    it("should retrieve data", () => {
      return coll.getData().should.become({ a: 1 });
    });
  });

  /** @test {Collection#setData} */
  describe("#setData()", () => {
    let updateRequestStub: sinon.SinonStub;

    beforeEach(() => {
      updateRequestStub = sandbox.stub(requests, "updateRequest");
      sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: { foo: "bar" } }));
    });

    it("should set the data", () => {
      coll.setData({ a: 1 });

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts",
        { data: { a: 1 }, permissions: undefined },
        { headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should handle the safe option", () => {
      coll.setData({ a: 1 }, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts",
        { data: { a: 1 }, permissions: undefined },
        { headers: { Foo: "Bar", Baz: "Qux" }, safe: true, last_modified: 42 }
      );
    });

    it("should handle the patch option", () => {
      coll.setData({ a: 1 }, { patch: true });

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts",
        { data: { a: 1 }, permissions: undefined },
        { headers: { Foo: "Bar", Baz: "Qux" }, patch: true }
      );
    });

    it("should resolve with json result", () => {
      return coll.setData({ a: 1 }).should.become({ data: { foo: "bar" } });
    });
  });

  /** @test {Collection#createRecord} */
  describe("#createRecord()", () => {
    const record = { title: "foo" };
    let executeStub: sinon.SinonStub;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: 1 }));
    });

    it("should create the expected request", () => {
      const createRequestStub = sandbox.stub(requests, "createRequest");

      coll.createRecord(record);

      sinon.assert.calledWith(
        createRequestStub,
        "/buckets/blog/collections/posts/records",
        { data: record, permissions: undefined },
        { headers: { Foo: "Bar", Baz: "Qux" }, safe: false }
      );
    });

    it("should accept a safe option", () => {
      const createRequestStub = sandbox.stub(requests, "createRequest");

      coll.createRecord(record, { safe: true });

      sinon.assert.calledWithMatch(
        createRequestStub,
        "/buckets/blog/collections/posts/records",
        { data: record, permissions: undefined },
        { safe: true, headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should execute the expected request", () => {
      return coll.createRecord(record).then(() => {
        sinon.assert.calledWithMatch(executeStub, {
          path: "/buckets/blog/collections/posts/records",
        });
      });
    });

    it("should resolve with response body", () => {
      return coll.createRecord(record).should.become({ data: 1 });
    });
  });

  /** @test {Collection#updateRecord} */
  describe("#updateRecord()", () => {
    const record = { id: "2", title: "foo" };

    beforeEach(() => {
      sandbox.stub(client, "execute").returns(Promise.resolve({ data: 1 }));
    });

    it("should throw if record is not an object", () => {
      return coll
        .updateRecord(2 as any)
        .should.be.rejectedWith(Error, /record object is required/);
    });

    it("should throw if id is missing", () => {
      return coll
        .updateRecord({} as any)
        .should.be.rejectedWith(Error, /record id is required/);
    });

    it("should create the expected request", () => {
      const updateRequestStub = sandbox.stub(requests, "updateRequest");

      coll.updateRecord(record);

      sinon.assert.calledWith(
        updateRequestStub,
        "/buckets/blog/collections/posts/records/2",
        { data: record, permissions: undefined },
        {
          headers: { Foo: "Bar", Baz: "Qux" },
          safe: false,
          last_modified: undefined,
          patch: false,
        }
      );
    });

    it("should accept a safe option", () => {
      const updateRequestStub = sandbox.stub(requests, "updateRequest");

      coll.updateRecord({ ...record, last_modified: 42 }, { safe: true });

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts/records/2",
        { data: { ...record, last_modified: 42 }, permissions: undefined },
        { safe: true, headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should accept a patch option", () => {
      const updateRequestStub = sandbox.stub(requests, "updateRequest");

      coll.updateRecord(record, { patch: true });

      sinon.assert.calledWithMatch(
        updateRequestStub,
        "/buckets/blog/collections/posts/records/2",
        { data: record, permissions: undefined },
        { patch: true, headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should resolve with response body", () => {
      return coll.updateRecord(record).should.become({ data: 1 });
    });
  });

  /** @test {Collection#deleteRecord} */
  describe("#deleteRecord()", () => {
    let deleteRequestStub: sinon.SinonStub;

    beforeEach(() => {
      deleteRequestStub = sandbox.stub(requests, "deleteRequest");
      sandbox.stub(client, "execute").returns(Promise.resolve({ data: 1 }));
    });

    it("should throw if id is missing", () => {
      return coll
        .deleteRecord({} as any)
        .should.be.rejectedWith(Error, /record id is required/);
    });

    it("should delete a record", () => {
      coll.deleteRecord("1");

      sinon.assert.calledWith(
        deleteRequestStub,
        "/buckets/blog/collections/posts/records/1",
        {
          last_modified: undefined,
          headers: { Foo: "Bar", Baz: "Qux" },
          safe: false,
        }
      );
    });

    it("should accept a safe option", () => {
      coll.deleteRecord("1", { safe: true });

      sinon.assert.calledWithMatch(
        deleteRequestStub,
        "/buckets/blog/collections/posts/records/1",
        {
          last_modified: undefined,
          safe: true,
        }
      );
    });

    it("should rely on the provided last_modified for the safe option", () => {
      coll.deleteRecord({ id: "1", last_modified: 42 }, { safe: true });

      sinon.assert.calledWithMatch(
        deleteRequestStub,
        "buckets/blog/collections/posts/records/1",
        {
          last_modified: 42,
          safe: true,
        }
      );
    });
  });

  /** @test {Collection#getRecord} */
  describe("#getRecord()", () => {
    let executeStub: sinon.SinonStub;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: 1 }));
    });

    it("should execute expected request", () => {
      coll.getRecord("1");

      sinon.assert.calledWith(executeStub, {
        path: "/buckets/blog/collections/posts/records/1",
        headers: { Foo: "Bar", Baz: "Qux" },
      });
    });

    it("should retrieve a record", () => {
      return coll.getRecord("1").should.become({ data: 1 });
    });

    it("should support query and fields", () => {
      coll.getRecord("1", { query: { a: "b" }, fields: ["c", "d"] });

      sinon.assert.calledWith(executeStub, {
        headers: { Baz: "Qux", Foo: "Bar" },
        path: "/buckets/blog/collections/posts/records/1?a=b&_fields=c,d",
      });
    });
  });

  /** @test {Collection#getRecordsTimestamp} */
  describe("#getRecordsTimestamp()", () => {
    it("should execute expected request", () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve());

      getBlogPostsCollection().getRecordsTimestamp();

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "HEAD",
          path: "/buckets/blog/collections/posts/records",
          headers: {},
        },
        { raw: true }
      );
    });

    it("should resolve with the ETag header value", () => {
      const etag = '"42"';
      sandbox.stub(client, "execute").returns(
        Promise.resolve({
          headers: {
            get(value: string) {
              return value == "ETag" ? etag : null;
            },
          },
        })
      );

      return getBlogPostsCollection()
        .getRecordsTimestamp()
        .should.become(etag);
    });
  });

  /** @test {Collection#listRecords} */
  describe("#listRecords()", () => {
    const data = {
      last_modified: "",
      data: [{ id: "a" }, { id: "b" }],
      next: () => {},
      hasNextPage: false,
    };
    let paginatedListStub: sinon.SinonStub;

    beforeEach(() => {
      paginatedListStub = sandbox
        .stub(coll.client, "paginatedList")
        .returns(Promise.resolve(data));
    });

    it("should execute expected request", () => {
      coll.listRecords({ since: "42" });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/collections/posts/records",
        { since: "42" },
        { headers: { Baz: "Qux", Foo: "Bar" }, retry: 0 }
      );
    });

    it("should support passing custom headers", () => {
      coll.listRecords({ headers: { "Another-Header": "Hello" } });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets",
        {},
        { headers: { Foo: "Bar", Baz: "Qux", "Another-Header": "Hello" } }
      );
    });

    it("should resolve with a result object", () => {
      return coll
        .listRecords()
        .should.eventually.have.property("data")
        .eql(data.data);
    });

    it("should support filters and fields", () => {
      coll.listRecords({ filters: { a: "b" }, fields: ["c", "d"] });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/collections/posts/records",
        { filters: { a: "b" }, fields: ["c", "d"] }
      );
    });

    describe("Retry", () => {
      const response = { data: [{ id: 1, title: "art" }] };

      beforeEach(() => {
        sandbox.restore();
        sandbox.stub(global, "setTimeout").callsFake(setImmediate as any);
        const fetchStub = sandbox.stub(global as any, "fetch");
        fetchStub
          .onCall(0)
          .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
        fetchStub.onCall(1).returns(fakeServerResponse(200, response));
      });

      it("should retry the request if option is specified", () => {
        return coll
          .listRecords({ retry: 1 })
          .then(r => r.data[0])
          .should.eventually.have.property("title")
          .eql("art");
      });
    });
  });

  /** @test {Collection#batch} */
  describe("#batch()", () => {
    it("should batch operations", () => {
      const batchStub = sandbox.stub();
      sandbox.stub(client, "batch").get(() => batchStub);
      // @ts-ignore
      const fn = (batch: any) => {};

      coll.batch(fn);

      sinon.assert.calledWith(batchStub, fn, {
        bucket: "blog",
        collection: "posts",
        headers: { Foo: "Bar", Baz: "Qux" },
        retry: 0,
        safe: false,
        aggregate: false,
      });
    });
  });
});
