# CycleRouting

[Try it out!](http://www.user.tu-berlin.de/konstantinpelz/cycleRouting/)

[Try out the development build!](https://komape.github.io/cycleRouting/)

## Idea

Currently there is no tool for long distance bike trip routing which considers official bike paths. Sometimes they even go parallel to one. But most if the times it's just easier and smoother to follow an official and mostly marked bike path. That's the idea behind CycleRouting.

## Technical background

The maps are coming from [Leaflet](https://leafletjs.com/).<br>
The geo coding is done by [Graphhopper](https://www.graphhopper.com/).<br>
The actual routing is done by [BRouter](http://brouter.de/) with an adjusted routing profile.<br>