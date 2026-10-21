FROM node:20-slim

# Install latest chrome dev package, fonts and gosu for root-to-user privilege drop
RUN apt-get update \
    && apt-get install -y wget gnupg gosu \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

RUN npm install

# Bundle app source
COPY . .

# Create necessary directories
RUN mkdir -p uploads output database
RUN chmod 777 uploads output database

# Create non-root pptruser
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /usr/src/app

# Ensure entrypoint script is executable
RUN chmod +x /usr/src/app/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
CMD [ "npm", "start" ]
