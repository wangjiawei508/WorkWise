# Model Provider Presets

## Context

DeepChat handles model suppliers in two layers:

- A default provider catalog stores provider id, display name, base URL, API type,
  documentation links, and whether the provider is enabled.
- A runtime registry maps each provider or API type to a request protocol such as
  OpenAI-compatible chat completions or Anthropic messages.

WorkWise Agent Runtime already has the runtime half in a smaller form. Settings store
`provider.providers[]`, the active WorkWise Agent Runtime runtime stores `providerId`, and the
runtime resolves the selected provider into API key, base URL, and endpoint
format. The model endpoint formats already cover OpenAI Chat Completions,
OpenAI Responses, and Anthropic Messages.

## Design

Do not add a second runtime or a DeepChat-style provider presenter. Add a small
shared provider preset catalog that produces existing `ModelProviderProfileV1`
objects.

The Settings > Providers panel should let users:

- add a blank custom provider as before,
- add a known preset provider,
- select the newly added preset as the active WorkWise Agent Runtime provider,
- keep provider fields editable after creation,
- configure optional image-generation capabilities on a provider.

Preset providers remain opt-in because this project does not have a separate
enabled/disabled provider flag. Adding every known provider by default would
make all of their models appear in the composer before credentials are set.

## Initial Presets

Xiaomi:

- id: `xiaomi`
- base URL: `https://api.xiaomimimo.com/v1`
- endpoint format: OpenAI Chat Completions
- initial models: `mimo-v2-omni`, `mimo-v2.5-pro-ultraspeed`,
  `mimo-v2-pro`, `mimo-v2.5`, `mimo-v2-flash`, `mimo-v2.5-pro`

MiniMax:

- id: `minimax`
- base URL: `https://api.minimaxi.com/anthropic`
- endpoint format: Anthropic Messages
- initial models: `MiniMax-M2.5`, `MiniMax-M3`,
  `MiniMax-M2.5-highspeed`, `MiniMax-M2.7`, `MiniMax-M2`,
  `MiniMax-M2.7-highspeed`, `MiniMax-M2.1`
- image protocol: MiniMax `/v1/image_generation`
- image base URL: `https://api.minimaxi.com`
- image models: `image-01`

The defaults mirror DeepChat's current provider definitions and local model DB,
plus MiniMax's documented image generation API. They are not locked. Users can
edit base URLs, protocols, and model IDs if provider endpoints change.
