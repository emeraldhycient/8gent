import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
export default function Home() {
  return (
    <main>
      <Tabs defaultValue="all" className="max-w-3xl mx-auto mt-10">
        <TabsList>
          <TabsTrigger value="all">All Jobs</TabsTrigger>
          <TabsTrigger value="recommended">Recommended Jobs</TabsTrigger>
          <TabsTrigger value="auto">Auto Apply</TabsTrigger>
        </TabsList>
        <TabsContent value="all">View all job listings here.</TabsContent>
        <TabsContent value="recommended">View recommended job listings here.</TabsContent>
        <TabsContent value="auto">Enable auto-apply for job listings here.</TabsContent>
      </Tabs>
    </main>
  );
}
