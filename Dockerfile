FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /data && chown node:node /data
ENV BIND_HOST=0.0.0.0
ENV DATA_FILE=/data/requests.json
USER node
EXPOSE 3000
EXPOSE 3002
CMD ["node", "work/preview.cjs"]
