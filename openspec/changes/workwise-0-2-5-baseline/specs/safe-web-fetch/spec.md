## ADDED Requirements

### Requirement: Web Fetch only connects to validated public addresses
Web Fetch SHALL resolve and validate every destination and SHALL reject loopback, private, link-local, carrier-grade NAT, multicast, unspecified, reserved, and mapped-address bypasses.

#### Scenario: Public name resolves privately
- **WHEN** a requested hostname resolves to any non-public address
- **THEN** the request fails before a connection is opened

### Requirement: Redirects are manually bounded and revalidated
Web Fetch SHALL follow no more than five redirects and SHALL reapply scheme, domain, DNS, IP, and size policy at every hop.

#### Scenario: Public redirect to metadata service
- **WHEN** a public URL redirects to a private or link-local endpoint
- **THEN** the redirect is rejected with a structured safe-fetch error

### Requirement: Web response resources are bounded
Web Fetch SHALL enforce DNS, connection, total-time, encoding, declared-length, and streamed-byte limits.

#### Scenario: Oversized streamed response
- **WHEN** a response exceeds the effective byte ceiling while streaming
- **THEN** WorkWise aborts the request and returns `payload_too_large`
