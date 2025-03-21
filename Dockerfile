FROM denoland/deno

EXPOSE 8080

WORKDIR /app

ADD . /app

CMD ["run", "--allow-net", "--allow-env", "main.ts"]