VERSION       ?= `cat VERSION`

.PHONY: tag
tag:
	git tag -a $(VERSION) -m "version $(VERSION)"
	git push origin $(VERSION)

#########
## DEV ##
#########

.PHONY: dev
dev:
	pip install -r requirements.txt
	pip install -e .

###########
## TESTS ##
###########

.PHONY: test
test: $(resources-test)
	RESOURCES=resources/$(TEST_RESOURCES_VERSION) \
	python -W ignore -m unittest discover -p "test*.py"


##########################
## DEV BUILD AND DEPLOY ##
##########################
REGION          ?= us-central1
PROJECT_ID      ?= chris-personal-project-dev
REPOSITORY_NAME ?= simulation-lab
IMAGE_NAME      ?= simulation-labs-frontend

TAG       ?= $(shell git describe --tags --dirty --always)
IMAGE_URI ?= $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPOSITORY_NAME)/$(IMAGE_NAME):$(TAG)

.PHONY: build
build:
	docker build --network host -t $(IMAGE_URI) -f Dockerfile .

.PHONY: push
push:
	docker push $(IMAGE_URI)


VITE_PORT ?= 5173

.PHONY: run-image
run-image:
	docker run --rm -it \
	  -p $(VITE_PORT):$(VITE_PORT) \
	  $(IMAGE_URI) \
	  /bin/bash -c "server/venv/bin/python server/app.py & npm run dev -- --port $(VITE_PORT) --host"

.PHONY: dev-in-docker 
dev-in-docker:
	docker run -it --rm \
  		-v "$(CURDIR):/app" -w /app \
	  	-p $(VITE_PORT):$(VITE_PORT) \
		--network host \
  		$(IMAGE_URI) \
	    /bin/bash

.PHONY: test
test:
	npm run test
