# Regras internas de versionamento do BoRan Studio

O BoRan Studio usa versionamento semântico **MAJOR.MINOR.PATCH**. O sistema não utiliza REV.

## Como a versão aumenta

- **MAJOR**: alterações incompatíveis ou commits com indicação de breaking change, como `feat!:` ou `BREAKING CHANGE:`.
- **MINOR**: novas funcionalidades indicadas por `feat:`.
- **PATCH**: correções e demais alterações elegíveis que não sejam uma nova funcionalidade nem uma breaking change, incluindo `fix:`, `chore:`, `docs:`, `test:`, `ci:`, `style:`, `refactor:` e `perf:`.
- Se um intervalo de commits contiver mais de um tipo, prevalece o nível mais alto: MAJOR, depois MINOR e depois PATCH.

## Detecção automática

O script analisa alterações em todo o repositório, incluindo páginas HTML, scripts, configurações, testes, documentação e workflows. Alterações relevantes em qualquer área do repositório também podem gerar uma nova versão.

Os arquivos `version-history.json`, `VERSION_HISTORY.md` e `public/version-history.json` são artefatos de histórico gerados automaticamente e não geram outra versão por si só.

Cada nova entrada de histórico registra a data em UTC e o instante ISO 8601 (`timestamp`). Entradas históricas antigas podem não conter esse campo.

O histórico deve descrever as alterações reais. Evite mensagens genéricas como “atualizações, melhorias e correções desta versão”; prefira mensagens de commit específicas, por exemplo `fix(portal): preserve app navigation` ou `feat(portal): add a product card`.

## Comandos

- `npm run version:patch` — incrementa PATCH.
- `npm run version:minor` — incrementa MINOR e zera PATCH.
- `npm run version:major` — incrementa MAJOR e zera MINOR e PATCH.
- `npm run version:check` — verifica consistência entre versão e histórico.
- `npm test` — executa os testes do script de versionamento.

O script atualiza o campo `version` do `package.json` e os históricos. O workflow cria uma tag Git anotada no formato `vMAJOR.MINOR.PATCH` junto com cada commit de versão. A versão do BoRan Studio é independente.
