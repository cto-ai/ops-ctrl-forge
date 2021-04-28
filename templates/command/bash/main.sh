#!/bin/bash

repo=$(ux prompt input \
   --message "Which application do you want to deploy?" \
   --name "repo")

sdk track "" \
  event_name:deployment \
  event_action:succeeded \
  repo:"${repo}" \
  branch:"main"

ux print "🚀 You reported that ${repo}'s deployment succeeded!"
