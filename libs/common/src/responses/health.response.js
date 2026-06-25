"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthResponse = createHealthResponse;
function createHealthResponse(service) {
    return {
        service,
        status: 'ok',
        timestamp: new Date().toISOString(),
    };
}
//# sourceMappingURL=health.response.js.map