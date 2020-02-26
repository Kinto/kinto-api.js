import chai, { expect } from "chai";
import sinon from "sinon";
import { EventEmitter } from "events";
import { fakeServerResponse, Stub } from "./test_utils";
import HTTP from "../src/http";
import {
  NetworkTimeoutError,
  ServerResponse,
  UnparseableResponseError,
} from "../src/errors";

chai.should();
chai.config.includeStack = true;

/** @test {HTTP} */
describe("HTTP class", () => {
  let sandbox: sinon.SinonSandbox, events: EventEmitter, http: HTTP;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    events = new EventEmitter();
    http = new HTTP(events, { timeout: 100 });
  });

  afterEach(() => sandbox.restore());

  /** @test {HTTP#constructor} */
  describe("#constructor", () => {
    it("should expose a passed events instance", () => {
      const events = new EventEmitter();
      const http = new HTTP(events);
      expect(http.events).to.eql(events);
    });

    it("should accept a requestMode option", () => {
      expect(
        new HTTP(events, {
          requestMode: "no-cors",
        }).requestMode
      ).eql("no-cors");
    });

    it("should complain if an events handler is not provided", () => {
      expect(() => {
        new (HTTP as any)();
      }).to.Throw(Error, /No events handler provided/);
    });
  });

  /** @test {HTTP#request} */
  describe("#request()", () => {
    describe("Request headers", () => {
      let fetchStub: sinon.SinonStub;
      beforeEach(() => {
        fetchStub = sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(200, {}, {}));
      });

      it("should set default headers", () => {
        http.request("/");

        expect(fetchStub.firstCall.args[1].headers).eql(
          HTTP.DEFAULT_REQUEST_HEADERS
        );
      });

      it("should merge custom headers with default ones", () => {
        http.request("/", { headers: { Foo: "Bar" } });

        expect(fetchStub.firstCall.args[1].headers.Foo).eql("Bar");
      });

      it("should drop custom content-type header for multipart body", () => {
        http.request("/", {
          headers: { "Content-Type": "application/foo" },
          body: new FormData(),
        });

        expect(fetchStub.firstCall.args[1].headers["Content-Type"]).to.be
          .undefined;
      });
    });

    describe("Request CORS mode", () => {
      let fetchStub: sinon.SinonStub;
      beforeEach(() => {
        fetchStub = sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(200, {}, {}));
      });

      it("should use default CORS mode", () => {
        new HTTP(events).request("/");

        expect(fetchStub.firstCall.args[1].mode).eql("cors");
      });

      it("should use configured custom CORS mode", () => {
        new HTTP(events, { requestMode: "no-cors" }).request("/");

        expect(fetchStub.firstCall.args[1].mode).eql("no-cors");
      });
    });

    describe("Succesful request", () => {
      beforeEach(() => {
        sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(200, { a: 1 }, { b: 2 }));
      });

      it("should resolve with HTTP status", async () => {
        const { status } = await http.request("/");
        status.should.equal(200);
      });

      it("should resolve with JSON body", async () => {
        const { json } = await http.request("/");
        json.should.deep.equal({ a: 1 });
      });

      it("should resolve with headers", async () => {
        const { headers } = await http.request("/");
        headers.get("b")!.should.equal(2);
      });
    });

    describe("Request timeout", () => {
      beforeEach(() => {
        sandbox.stub(global as any, "fetch").returns(
          new Promise(resolve => {
            setTimeout(resolve, 20000);
          })
        );
      });

      it("should timeout the request", async () => {
        let error: Error;

        try {
          await http.request("/");
        } catch (err) {
          error = err;
        }

        error!.should.not.be.undefined;
        error!.should.be.instanceOf(NetworkTimeoutError);
      });

      it("should show request properties in error", async () => {
        let error: Error;

        try {
          await http.request("/", {
            mode: "cors",
            headers: {
              Authorization: "XXX",
              "User-agent": "mocha-test",
            },
          });
        } catch (err) {
          error = err;
        }

        error!.should.not.be.undefined;
        error!.should.have
          .property("message")
          .equal(
            'Timeout while trying to access / with {"mode":"cors","headers":{"accept":"application/json","authorization":"**** (suppressed)","content-type":"application/json","user-agent":"mocha-test"}}'
          );
      });
    });

    describe("No content response", () => {
      it("should resolve with null JSON if Content-Length header is missing", async () => {
        sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(200, null, {}));

        const { json } = await http.request("/");
        expect(json).to.be.null;
      });
    });

    describe("Malformed JSON response", () => {
      it("should reject with an appropriate message", async () => {
        sandbox.stub(global as any, "fetch").returns(
          Promise.resolve({
            status: 200,
            headers: {
              get(name: string) {
                if (name !== "Alert") {
                  return "fake";
                }
              },
            },
            text() {
              return Promise.resolve("an example of invalid JSON");
            },
          })
        );

        let error: Error;

        try {
          await http.request("/");
        } catch (err) {
          error = err;
        }

        error!.should.not.be.undefined;
        error!.should.be.instanceOf(UnparseableResponseError);
        error!.should.have
          .property("message")
          .match(
            /HTTP 200; SyntaxError: Unexpected token.+an example of invalid JSON/
          );
      });
    });

    describe("Business error responses", () => {
      it("should reject on status code > 400", async () => {
        sandbox.stub(global as any, "fetch").returns(
          fakeServerResponse(400, {
            code: 400,
            details: [
              {
                description: "data is missing",
                location: "body",
                name: "data",
              },
            ],
            errno: 107,
            error: "Invalid parameters",
            message: "data is missing",
          })
        );

        let error: Error;

        try {
          await http.request("/");
        } catch (err) {
          error = err;
        }

        error!.should.not.be.undefined;
        error!.should.be.instanceOf(ServerResponse);
        error!.should.have
          .property("message")
          .match(
            /HTTP 400 Invalid parameters: Invalid request parameter \(data is missing\)/
          );
      });

      it("should expose JSON error bodies", async () => {
        const errorBody = {
          code: 400,
          details: [
            {
              description: "data is missing",
              location: "body",
              name: "data",
            },
          ],
          errno: 107,
          error: "Invalid parameters",
          message: "data is missing",
        };
        sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(400, errorBody));

        let error: Error;

        try {
          await http.request("/");
        } catch (err) {
          error = err;
        }

        error!.should.not.be.undefined;
        error!.should.be.instanceOf(ServerResponse);
        error!.should.have.deep.property("data", errorBody);
      });

      it("should reject on status code > 400 even with empty body", async () => {
        sandbox.stub(global as any, "fetch").resolves({
          status: 400,
          statusText: "Cake Is A Lie",
          headers: {
            get(name: string) {
              if (name === "Content-Length") {
                return 0;
              }
            },
          },
          text() {
            return Promise.resolve("");
          },
        });

        let error: Error;

        try {
          await http.request("/");
        } catch (err) {
          error = err;
        }

        error!.should.not.be.undefined;
        error!.should.be.instanceOf(ServerResponse);
        error!.should.have.property("message").match(/HTTP 400 Cake Is A Lie$/);
      });
    });

    describe("Deprecation header", () => {
      const eolObject = {
        code: "soft-eol",
        url: "http://eos-url",
        message: "This service will soon be decommissioned",
      };

      let consoleWarnStub: Stub<typeof console.warn>;
      let eventsEmitStub: Stub<typeof events.emit>;

      beforeEach(() => {
        consoleWarnStub = sandbox.stub(console, "warn");
        eventsEmitStub = sandbox.stub(events, "emit");
      });

      it("should handle deprecation header", async () => {
        sandbox
          .stub(global as any, "fetch")
          .returns(
            fakeServerResponse(200, {}, { Alert: JSON.stringify(eolObject) })
          );

        await http.request("/");
        sinon.assert.calledOnce(consoleWarnStub);
        sinon.assert.calledWithExactly(
          consoleWarnStub,
          eolObject.message,
          eolObject.url
        );
      });

      it("should handle deprecation header parse error", async () => {
        sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(200, {}, { Alert: "dafuq" }));

        await http.request("/");
        sinon.assert.calledOnce(consoleWarnStub);
        sinon.assert.calledWithExactly(
          consoleWarnStub,
          "Unable to parse Alert header message",
          "dafuq"
        );
      });

      it("should emit a deprecated event on Alert header", async () => {
        sandbox
          .stub(global as any, "fetch")
          .returns(
            fakeServerResponse(200, {}, { Alert: JSON.stringify(eolObject) })
          );

        await http.request("/");
        expect(eventsEmitStub.firstCall.args[0]).eql("deprecated");
        expect(eventsEmitStub.firstCall.args[1]).eql(eolObject);
      });
    });

    describe("Backoff header handling", () => {
      let eventsEmitStub: Stub<typeof events.emit>;
      beforeEach(() => {
        // Make Date#getTime always returning 1000000, for predictability
        sandbox.stub(Date.prototype, "getTime").returns(1000 * 1000);
        eventsEmitStub = sandbox.stub(events, "emit");
      });

      it("should emit a backoff event on set Backoff header", async () => {
        sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(200, {}, { Backoff: "1000" }));

        await http.request("/");
        expect(eventsEmitStub.firstCall.args[0]).eql("backoff");
        expect(eventsEmitStub.firstCall.args[1]).eql(2000000);
      });

      it("should emit a backoff event even on error responses", async () => {
        sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(503, {}, { Backoff: "1000" }));

        try {
          await http.request("/");
        } catch (err) {}
        expect(eventsEmitStub.firstCall.args[0]).eql("backoff");
        expect(eventsEmitStub.firstCall.args[1]).eql(2000000);
      });

      it("should emit a backoff event on missing Backoff header", async () => {
        sandbox
          .stub(global as any, "fetch")
          .returns(fakeServerResponse(200, {}, {}));

        await http.request("/");
        expect(eventsEmitStub.firstCall.args[0]).eql("backoff");
        expect(eventsEmitStub.firstCall.args[1]).eql(0);
      });
    });

    describe("Retry-After header handling", () => {
      let eventsEmitStub: Stub<typeof events.emit>;
      describe("Event", () => {
        beforeEach(() => {
          // Make Date#getTime always returning 1000000, for predictability
          sandbox.stub(Date.prototype, "getTime").returns(1000 * 1000);
          eventsEmitStub = sandbox.stub(events, "emit");
        });

        it("should emit a retry-after event when Retry-After is set", async () => {
          sandbox
            .stub(global as any, "fetch")
            .returns(fakeServerResponse(200, {}, { "Retry-After": "1000" }));

          await http.request("/", {}, { retry: 0 });
          expect(eventsEmitStub.lastCall.args[0]).eql("retry-after");
          expect(eventsEmitStub.lastCall.args[1]).eql(2000000);
        });
      });

      describe("Retry loop", () => {
        let fetch: sinon.SinonStub;

        beforeEach(() => {
          fetch = sandbox.stub(global as any, "fetch");
          // Avoid actually waiting real time for retries in test suites.
          // We can't use Sinon fakeTimers since we can't tick the fake
          // clock at the right moment (just after request failure).
          sandbox
            .stub(global, "setTimeout")
            .callsFake(fn => setImmediate(fn) as any);
        });

        it("should not retry the request by default", async () => {
          fetch.returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));

          let error: Error;

          try {
            await http.request("/");
          } catch (err) {
            error = err;
          }

          error!.should.not.be.undefined;
          error!.should.be.instanceOf(Error);
          error!.should.have.property("message").match(/HTTP 503/);
        });

        it("should retry the request if specified", async () => {
          const success = { success: true };
          fetch
            .onCall(0)
            .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
          fetch.onCall(1).returns(fakeServerResponse(200, success));

          const { json } = await http.request("/", {}, { retry: 1 });
          json.should.deep.equal(success);
        });

        it("should error when retries are exhausted", async () => {
          fetch
            .onCall(0)
            .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
          fetch
            .onCall(1)
            .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
          fetch
            .onCall(2)
            .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));

          let error: Error;

          try {
            await http.request("/", {}, { retry: 2 });
          } catch (err) {
            error = err;
          }

          error!.should.not.be.undefined;
          error!.should.be.instanceOf(Error);
          error!.should.have.property("message").match(/HTTP 503/);
        });
      });
    });
  });
});
