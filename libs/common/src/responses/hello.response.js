"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHelloResponse = createHelloResponse;
function createHelloResponse(service) {
    return {
        service,
        message: `Hello from ${service}`,
    };
}
//# sourceMappingURL=hello.response.js.map