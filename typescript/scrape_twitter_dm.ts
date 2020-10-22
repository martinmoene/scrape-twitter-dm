
// Copyright 2020 by Martin Moene
//
// Distributed under the Boost Software License, Version 1.0.
// (See accompanying file LICENSE.txt or copy at http://www.boost.org/LICENSE_1_0.txt)
//
// Scrape Twitter Archive for its DMs and create an epub e-book of it.
//
// Usage: script/xxxx [-h] [-v] [options...] p1-name:p1-id,p2-name:p2-id[,p3...] twitter-archive [output_path]
//
// Output format: {date}\t{sender-name}\t{message}
//
// Dependencies:
// - npm, typescript, node (https://www.npmjs.com/)
// - twitter-archive-reader (TypeScript, https://github.com/alkihis/twitter-archive-reader)
//
// Process:
// 1. Read twitter archive, create epub/xxx.txt with typescript/scrape_twitter_dm.ts
// 2. Convert messages to e-book via markdown using script/scrape_twitter_txt_epub.py

// Folders:
// - epub         : resulting text, markdown and e-book
// - .../template : default front_matter.md, style.css
// - media        : images
// - node_modules : JavaScript dependencies
// - script       : Python scripts
// - typescript   : this script
// - typescript-js: JavaScript generated from TypeScript

// ----------------
// Structure of a conversation:
//
// Conversation {
//   _index: {
//     '1265899312388599812': {
//       recipientId: '239822901',
//       reactions: [],
//       urls: [],
//       text: 'Text',
//       mediaUrls: [],
//       senderId: '15889300',
//       id: '1265899312388599812',
//       createdAt: '2020-05-28T06:54:50.051Z',
//       createdAtDate: 2020-05-28T06:54:50.051Z,
//       previous: null,
//       next: [Object]
//     },
//     '1265899616760889348': { ... }
//   }
// ----------------

// export { scrape_twitter_dm }

import { stdout, stderr } from "process";
import { TwitterArchive, DMArchive, Conversation } from "twitter-archive-reader";

// Store both name,id and id,name:

interface Participants { [key : string] : string /*{ val : string }*/ }

// Convenience functions:

// The number of people:

function count( participants : Participants ) : number
{
	return Object.keys(participants).length / 2
}

// True if string contains number:

function is_numeric( text : string ) : boolean
{
	return !!text.match(/[0-9]+/)
}

// Return name if available, id otherwise:

function to_name( name_or_id : string, participants : Participants ) : string
{
	if ( is_numeric( name_or_id ) )
		return participants[name_or_id] == undefined ? '[unknown]' : participants[name_or_id]
	
	return name_or_id
}

// Return id if available, name otherwise

function to_id( name_or_id : string, participants : Participants ) : string
{
	if ( is_numeric( name_or_id ) )
		return name_or_id
	
	return participants[name_or_id]
}

// Require two or more participants:

function require_participants( out : Writable, participants : Participants ) : boolean
{
	if ( count( participants ) < 2 )
	{
		out.write(`\nError: two or more participants expected, one given: '${participants[0]}'\n\n`)
		return true; // Error
	}
	return false; // Ok
}

// Print participant names and ids:

function print_participants( out : Writable, participants : Participants )
{
	out.write("\nParticipants: ")
	for ( const key in participants )
	{
		if ( !is_numeric( key ) )
			stderr.write(`\n- ${key} (${participants[key]})`)
	}
	out.write("\n\n")
}

// Bailout if not a GDPR archive (required for DMs):

function require_gdpr( out : Writable, archive : TwitterArchive ) : boolean
{
	if ( ! archive.is_gdpr === true )
	{
		out.write("Bailing out as archive is not a GDPR archive (required for access to DMs)\n")
		return true; // Error
	}
	return false // Ok
}

// Inform if GDPR archive type:

function print_gdpr( out : Writable, archive : TwitterArchive )
{
	out.write( archive.is_gdpr === true 
		? "Archive is a GDPR archive (required for access to DMs)\n"
		: "Archive is not a GDPR archive (required for access to DMs)\n"
	)
}

// Show some information on archive owner:

async function print_user_info( out : Writable, archive : TwitterArchive )
{
	const user = archive.user

	out.write(`
Screen name: ${user.screen_name}
Name: ${user.name}
Bio: ${user.bio}
Registered location: ${user.location}
User ID: ${user.id}
You are${user.verified ? "" : " not"} verified
Creation date: ${archive.user.created_at}
Creation IP: ${archive.user.account_creation_ip}
`);	

	// List the used screen names (@) over time

	const history = [
		...archive.user.screen_name_history.map(s => s.changedFrom),
		archive.user.screen_name
	];

	out.write(`You used the following names: @${history.join(', @')}\n`);

	// Get the user profile picture and banner as binary data

	const [profile, header] = await Promise.all([
		archive.medias.getProfilePictureOf(archive.user),
		archive.medias.getProfileBannerOf(archive.user)
	]);

	// return false // Ok
}

// Print conversations:

function print_conversations( out : Writable, archive : TwitterArchive )
{
	const conversations = archive.messages.all

	out.write(`\nThere are #${conversations.length} conversations here.\n\n`);

	for ( const text of conversations.map( c => 
		`Conversation ${c.id} with users ${[...c.participants].join(', ')}, containing ${c.length} messages.\n`) )
	{
		out.write(text)
	}
}

// Open archive by path:

function open_archive( out : Writable, ziparchive_path : string ) : TwitterArchive
{
	const archive = new TwitterArchive( ziparchive_path );

	// Initialization can be long (unzipping, tweets & DMs reading...) 
	// So archive supports events, you can listen for initialization steps
	// See all available listeners in Events section.

	archive.events.on('zipready', () => {
		out.write("ZIP is unzipped, ");
	});

	archive.events.on('tweetsread', () => {
		out.write("Tweet files has been read, ");
	});

	archive.events.on('ready', () => {
		out.write("Archive has been read.\n");
	});

	out.write("Reading twitter archive '" + ziparchive_path + "'\n")

	return archive
}

// Escape newline and tab, \udddd:

function to_line( text : string ) : string
{
	return text.
		replace(/\n/gi, "\\n").
		replace(/\\t/gi, "\\\\t").
		replace(/\\u/gi, "\\\\u")
}

// true if given id participates in the conversation:

function has_id( id : string, conversation : Conversation ) : boolean
{
	return is_numeric( id ) && conversation.participants.has( id )
}

// true if given participants participate in the conversation:

function has_participants( conversation : Conversation, participants : Participants ) : boolean
{
	for ( const key in participants )
	{
		if ( !has_id( key, conversation ) )
			return false;
		}
	return true;
}

// Provide direct messages (2 participants) or all messages (more than 2 participants):

function to_messages( messages : DMArchive, participants : Participants ) : Conversation[]
{
	return count(participants) <= 2 ? messages.directs : messages.all
}

// Select requested DMs and write as: {date}\t{sender-name}\t{message}:

function print_messages( out : Writable, participants : Participants, archive : TwitterArchive )
{
	for ( const conversation of to_messages( archive.messages, participants ) )
	{
		if ( has_participants( conversation, participants ) )
		{
			for ( const message of conversation )
			{
				out.write(`${message.createdAt}\t${to_name(message.senderId, participants)}\t${to_line(message.text)}\n`)
			}
		}
	}
}

// ----------------------------------------------
// main program:

import { exit /*, stdout*/ } from "process";
import { Writable } from "stream";
import { createWriteStream } from "fs";

// Print usage and participants specified:

function print_usage( out : Writable, code : number ) : number
{
	out.write(`
Usage: node scrape_twitter_dm p1-name:p1-id,p2[,p3...] path/to/twitter-archive.zip [path/to/twitter-archive.txt]

Create structured text file with entries: {date}\\t{sender-name}\\t{message}
`	)
	return code
}

//
// Print conversation in given archive between given participants:
//
// Format: {date}\t{sender-name}\t{message}
// 

async function scrape_twitter_dm( participants : Participants, ziparchive_path : string, output_path : string )
{
	if ( output_path.length )
		stderr.write(`\nOutput: '${output_path}'.\n`)

	if ( require_participants( stderr, participants ) )
		return

	print_participants( stderr, participants ) 

	const archive = open_archive( stderr, ziparchive_path );

	await archive.ready();
	
	print_gdpr( stderr, archive )
	print_user_info( stderr, archive )
	print_conversations( stderr, archive )

	if ( require_gdpr( stderr, archive ) )
		return

	const out = output_path.length > 0 ?  createWriteStream( output_path) : stdout

	print_messages( out, participants, archive )

	stderr.write('\nDone.\n')
}

// Convert list of participants to dictionary with keys both on name and id
// Input: Name1:id1,Name2:id2[, ...]

function to_participants( text: string ) : Participants
{
	var result : Participants = {};

	text.split(',').forEach( m => {
		const [k, v] = m.split(':')
		result[k] = v
		result[v] = k
	})

	return result
}

// Main entry, handle commandline:

function main( argv : string[] )
{
	// commandline arguments: node script participants ziparchive [out_path]
	// argv[0]: node
	// argv[1]: script
	// argv[2]: participants: p1-name:p1-id,p2-name:p2-id[,p3...]
	// argv[3]: path/to/ziparchive
	// argv[4]: output path, defaults to stdout

	if ( 4 > argv.length || argv.length > 5 )
	{
		exit( print_usage( stderr, 1 ) )
	}

	const output       = argv[4] || ''
	const ziparchive   = argv[3]
	const participants = to_participants( argv[2] )

	scrape_twitter_dm( participants, ziparchive, output )
}

// Execute script:

main( process.argv )
