# Image n8n figee + Kilo CLI : n8n orchestre, Kilo execute les agents de code
# (architecture A). L'image n8n n'a ni apk ni bash : tout passe par npm et sh.
FROM n8nio/n8n:2.44.6

USER root
RUN npm install -g @kilocode/cli@7.8.12 \
 && git config --system safe.directory '*' \
 && git config --system user.name "Pentacore n8n" \
 && git config --system user.email "pentacore@localhost" \
 && git config --system init.defaultBranch main
USER node
